/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */

interface ScenarioStep
{
    type: 'announcement' | 'wait';
    stateJson?: string;
    gapMs: number;
    waitSeconds?: number;
}

class Scenario
{
    private steps: ScenarioStep[] = [];
    private currentIndex: number = 0;
    private running: boolean = false;
    private paused: boolean = false;
    private timer: number = 0;
    private waitInterval: number = 0;
    /** When true, the scenario stops right after the current step (single-step play) */
    private stopAfterStep: boolean = false;
    /** Safety timer: advances the step even if the speech engine never signals completion */
    private watchdog: number = 0;
    /** Guard so a step completes (speech end or watchdog) and advances exactly once */
    private stepFinished: boolean = false;
    private loopCount: number = 1;
    private loopsDone: number = 0;

    public onStep?: (idx: number, total: number, step: ScenarioStep) => void;
    public onWaitCountdown?: (remaining: number, total: number) => void;
    public onComplete?: () => void;
    public onError?: (msg: string) => void;
    public onTextUpdate?: (text: string) => void;

    public setSteps(steps: ScenarioStep[]): void
    {
        this.steps = steps;
        this.currentIndex = 0;
    }

    public addStep(stateJson: string, gapMs: number = 1500): void
    {
        this.steps.push({ type: 'announcement', stateJson, gapMs });
    }

    public setLoopCount(n: number): void
    {
        this.loopCount = Math.max(1, n);
    }

    public get stepCount(): number { return this.steps.length; }
    public get isRunning(): boolean { return this.running; }
    public get isPaused(): boolean { return this.paused; }
    public exportJson(): void { /* no-op; dashboard handles export */ }
    public get currentLoopValue(): number { return this.loopsDone + 1; }
    public get totalLoopsValue(): number { return this.loopCount; }

    public clear(): void
    {
        this.stop();
        this.steps = [];
        this.currentIndex = 0;
    }

    public play(): void
    {
        if (this.steps.length === 0) return;
        if (this.paused)
        {
            this.paused = false;
            this.running = true;
            this.runStep();
            return;
        }
        this.stop();
        this.running = true;
        this.paused = false;
        this.currentIndex = 0;
        this.loopsDone = 0;
        this.stopAfterStep = false;
        this.runStep();
    }

    /** Plays exactly one step (its announcement, or its wait), then stops */
    public playStep(idx: number): void
    {
        if (idx < 0 || idx >= this.steps.length) return;

        this.stop();
        this.running = true;
        this.paused = false;
        this.currentIndex = idx;
        this.loopsDone = 0;
        this.loopCount = 1;
        this.stopAfterStep = true;
        this.runStep();
    }

    public pause(): void
    {
        if (!this.running) return;
        this.running = false;
        this.paused  = true;

        // Stop speech first: it may re-fire onstop, which could schedule a
        // pending advance; clear all timers afterwards so nothing survives.
        if (typeof RAG !== 'undefined' && RAG.speech) RAG.speech.stop();
        clearTimeout(this.timer);
        clearTimeout(this.watchdog);
        clearInterval(this.waitInterval);
        this.broadcast('STOP_PLAYBACK');
    }

    public stop(): void
    {
        this.running = false;
        this.paused  = false;

        // Stop speech first (see pause) so a re-fired onstop can't leave a
        // pending advance timer behind this clear.
        if (typeof RAG !== 'undefined' && RAG.speech) RAG.speech.stop();
        clearTimeout(this.timer);
        clearTimeout(this.watchdog);
        clearInterval(this.waitInterval);
        this.stepFinished = false;
        this.stopAfterStep = false;
        this.broadcast('STOP_PLAYBACK');
    }

    private runStep(): void
    {
        if (!this.running) return;

        if (this.currentIndex >= this.steps.length)
        {
            this.loopsDone++;
            if (this.loopsDone < this.loopCount)
            {
                this.currentIndex = 0;
                this.runStep();
                return;
            }
            this.running = false;
            this.paused = false;
            this.broadcast('STOP_PLAYBACK');
            if (this.onComplete) this.onComplete();
            return;
        }

        let step = this.steps[this.currentIndex];
        if (this.onStep) this.onStep(this.currentIndex, this.steps.length, step);

        if (step.type === 'wait')
        {
            let total = step.waitSeconds || 0;
            let remaining = total;
            let waitText = `Waiting ${remaining}s...`;
            if (this.onTextUpdate) this.onTextUpdate(waitText);
            if (this.onWaitCountdown) this.onWaitCountdown(remaining, total);
            if (typeof RAG !== 'undefined' && RAG.views && RAG.views.marquee) RAG.views.marquee.set(waitText);
            this.broadcast('WAIT_COUNTDOWN', { remainingSeconds: remaining, totalSeconds: total });

            this.waitInterval = window.setInterval(() =>
            {
                remaining--;
                if (remaining <= 0)
                {
                    clearInterval(this.waitInterval);
                    return;
                }
                let txt = `Waiting ${remaining}s...`;
                if (this.onTextUpdate) this.onTextUpdate(txt);
                if (this.onWaitCountdown) this.onWaitCountdown(remaining, total);
                if (typeof RAG !== 'undefined' && RAG.views && RAG.views.marquee) RAG.views.marquee.set(txt);
                this.broadcast('WAIT_COUNTDOWN', { remainingSeconds: remaining, totalSeconds: total });
            }, 1000);

            this.timer = window.setTimeout(() =>
            {
                clearInterval(this.waitInterval);
                this.advance();
            }, total * 1000);
            return;
        }

        // Announcement step
        try
        {
            if (step.stateJson && typeof RAG !== 'undefined' && RAG.load)
            {
                RAG.load(step.stateJson);
            }
        }
        catch (e)
        {
            if (this.onError) this.onError('Failed to load step state: ' + e);
            this.stop();
            return;
        }

        let text = (typeof RAG !== 'undefined' && RAG.views && RAG.views.editor) ? RAG.views.editor.getText() : 'Playing step...';
        if (this.onTextUpdate) this.onTextUpdate(text);
        if (typeof RAG !== 'undefined' && RAG.views && RAG.views.marquee) RAG.views.marquee.set(text);
        this.broadcast('PLAY_SCENARIO_STEP', { index: this.currentIndex, text: text });

        let phraseEl = (typeof RAG !== 'undefined' && RAG.views && RAG.views.editor) ? RAG.views.editor.getPhrase() : null;
        if (phraseEl && typeof RAG !== 'undefined' && RAG.speech)
        {
            // Reset the per-step guard, then arm both the normal path (speech
            // signals completion) and a watchdog in case the engine never does.
            this.stepFinished = false;

            RAG.speech.onspeak = () =>
            {
                let currentText = RAG.views.editor.getText();
                if (this.onTextUpdate) this.onTextUpdate(currentText);
                RAG.views.marquee.set(currentText);
                RAG.speech.onspeak = undefined;
            };

            RAG.speech.onstop = () =>
            {
                this.finishStep(step.gapMs);
            };

            // Watchdog: a backstop for a speech engine that never signals
            // completion. VOX announcements run longer than the text-length
            // estimate (clips plus pauses), so when the watchdog fires the
            // engine may still be playing real audio: extend a few times in
            // that case instead of cutting the announcement short. The bounded
            // re-arms keep a hung engine from stalling the scenario forever.
            let rearmLeft = 3;
            let armWatchdog = (ms: number) =>
            {
                clearTimeout(this.watchdog);
                this.watchdog = window.setTimeout(() =>
                {
                    let speaking = (typeof RAG !== 'undefined' && RAG.speech) ? RAG.speech.isSpeaking : false;
                    if (speaking && rearmLeft > 0)
                    {
                        rearmLeft--;
                        armWatchdog(30000);
                        return;
                    }
                    this.finishStep(step.gapMs);
                }, ms);
            };
            let watchdogMs = Math.min(60000, Math.max(6000, text.length * 90));
            armWatchdog(watchdogMs);

            RAG.speech.speak(phraseEl);
        }
        else
        {
            this.stepFinished = false;
            this.timer = window.setTimeout(() =>
            {
                this.advance();
            }, step.gapMs || 1500);
        }
    }

    /**
     * Completes the current step exactly once, whether it ended because the
     * speech engine signalled completion or because the watchdog fired. Safe
     * against the re-entrant onstop that speech.stop() can trigger: the
     * stepFinished guard is set before speech is stopped.
     */
    private finishStep(gapMs: number): void
    {
        if (this.stepFinished)
            return;
        this.stepFinished = true;

        clearTimeout(this.watchdog);
        if (typeof RAG !== 'undefined' && RAG.speech)
            RAG.speech.stop();

        this.timer = window.setTimeout(() =>
        {
            this.advance();
        }, gapMs || 0);
    }

    private advance(): void
    {
        if (!this.running) return;

        // "Play one step" mode: this step was the only one asked for, so
        // finish the run here.
        if (this.stopAfterStep)
        {
            this.stopAfterStep = false;
            this.running = false;
            this.paused = false;
            this.broadcast('STOP_PLAYBACK');
            if (this.onComplete) this.onComplete();
            return;
        }

        this.currentIndex++;
        this.runStep();
    }

    /** Broadcast a playback event to the other tabs (the editor mirrors it, display-only) */
    private broadcast(type: string, payload?: any): void
    {
        if (typeof RAG !== 'undefined' && RAG.channel)
            RAG.channel.send(type, payload || {});
    }
}

(window as any).Scenario = Scenario;
