/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */

/**
 * Controller for the top toolbar.
 *
 * The toolbar differs per page: the terminal page (index.html) runs
 * scenarios from its dashboard panel and edits steps in its in-page editor;
 * the display page (screen.html) is marquee-only (its toolbar is hidden at
 * boot). Buttons that are not present on a given page are looked up
 * optionally and simply not wired.
 */
class Toolbar
{
    private readonly dom         : HTMLElement;
    private readonly btnPlay     : HTMLButtonElement | null;
    private readonly btnStop     : HTMLButtonElement | null;
    private readonly btnGenerate : HTMLButtonElement;
    public  readonly btnSave     : HTMLButtonElement;
    public  readonly btnRecall   : HTMLButtonElement;
    public  readonly btnOption   : HTMLButtonElement;
    private readonly btnDashboard : HTMLButtonElement | null;
    private readonly btnScenario  : HTMLButtonElement;
    private readonly btnUpdateStep : HTMLButtonElement | null;

    public constructor()
    {
        this.dom         = DOM.require('#toolbar');
        this.btnPlay     = Toolbar.optional('#btnPlay');
        this.btnStop     = Toolbar.optional('#btnStop');
        this.btnGenerate = DOM.require('#btnShuffle');
        this.btnSave     = DOM.require('#btnSave');
        this.btnRecall   = DOM.require('#btnLoad');
        this.btnOption   = DOM.require('#btnSettings');
        this.btnDashboard = Toolbar.optional('#btnDashboard');
        this.btnScenario  = DOM.require('#btnScenario');
        this.btnUpdateStep = Toolbar.optional('#btnUpdateStep');

        if (this.btnPlay) this.btnPlay.onclick     = this.handlePlay.bind(this);
        if (this.btnStop) this.btnStop.onclick     = this.handleStop.bind(this);
        this.btnGenerate.onclick = this.handleGenerate.bind(this);
        this.btnSave.onclick     = this.handleSave.bind(this);
        this.btnRecall.onclick   = this.handleLoad.bind(this);
        this.btnOption.onclick   = this.handleOption.bind(this);
        if (this.btnDashboard)
        {
            this.btnDashboard.onclick = () =>
            {
                // If the in-page edit modal is open, close it (re-show the
                // dashboard panel). Otherwise open the marquee-only display
                // page in a new tab.
                if (RAG.dashboard && RAG.dashboard.editing)
                    RAG.dashboard.closeEdit();
                else
                    window.open('screen.html', '_blank');
            };
        }
        this.btnScenario.onclick = this.handleCaptureStep.bind(this);
        if (this.btnUpdateStep) this.btnUpdateStep.onclick = this.handleUpdateStep.bind(this);

        if (!RAG.config.clickedGenerate)
        {
            this.btnGenerate.classList.add('throb');
            this.btnGenerate.focus();
        }
        else if (this.btnPlay)
            this.btnPlay.focus();
    }

    /** Looks up a toolbar button that is legitimately absent on some pages */
    private static optional(sel: string) : HTMLButtonElement | null
    {
        return (document.querySelector(sel) as HTMLButtonElement | null) || null;
    }

    /** Plays the current announcement through the speech engine */
    private handlePlay() : void
    {
        RAG.speech.stop();
        if (this.btnPlay) this.btnPlay.disabled = true;
        window.setTimeout(this.handlePlay2.bind(this), 200);
    }

    private handlePlay2() : void
    {
        let hasSpoken   = false;
        let speechText  = RAG.views.editor.getText();
        if (this.btnPlay) { this.btnPlay.hidden = true; this.btnPlay.disabled = false; }
        if (this.btnStop)  this.btnStop.hidden = false;

        RAG.views.marquee.set('Loading VOX...', false);

        let timeout = window.setTimeout(() =>
        {
            clearTimeout(timeout);
            RAG.speech.stop();
        }, 10 * 1000);

        RAG.speech.onspeak = () =>
        {
            clearTimeout(timeout);
            RAG.views.marquee.set(speechText);
            hasSpoken          = true;
            RAG.speech.onspeak = undefined;
        };

        RAG.speech.onstop = () =>
        {
            clearTimeout(timeout);
            this.handleStop();
            if (!hasSpoken && RAG.config.voxEnabled)
            {
                RAG.config.voxEnabled = false;
                alert('It appears that the VOX engine was unable to say anything. The VOX engine has been disabled and native text-to-speech will be used on next play.');
            }
            else if (!hasSpoken)
                alert('It appears that the browser was unable to say anything. Please check the console.');
            if (!hasSpoken)
                RAG.views.marquee.set(speechText);
        };

        RAG.speech.speak(RAG.views.editor.getPhrase());
        if (this.btnStop) this.btnStop.focus();
    }

    private handleStop(ev?: Event) : void
    {
        RAG.speech.onspeak  = undefined;
        RAG.speech.onstop   = undefined;
        if (this.btnPlay) this.btnPlay.hidden = false;
        if (this.btnStop && this.btnPlay && document.activeElement === this.btnStop)
            this.btnPlay.focus();
        if (this.btnStop) this.btnStop.hidden = true;
        RAG.speech.stop();
        if (ev)
            RAG.views.marquee.set(RAG.views.editor.getText(), false);
    }

    private handleGenerate() : void
    {
        this.btnGenerate.classList.remove('throb');
        RAG.generate();
        RAG.config.clickedGenerate = true;
    }

    private handleSave() : void { RAG.views.statePicker.open('save'); }
    private handleLoad() : void { RAG.views.statePicker.open('load'); }
    private handleOption() : void { RAG.views.settings.open(); }

    /**
     * Captures the current announcement as a new step in the active scenario.
     * The active scenario lives in localStorage (shared with the dashboard);
     * if none is active yet, a fresh one is created and made active.
     */
    private handleCaptureStep() : void
    {
        let raw = localStorage.getItem('rag.scenarios');
        let scenarios : any[] = raw ? (JSON.parse(raw) as any[]) : [];
        let id = localStorage.getItem('rag.currentScenarioId');
        let sc = scenarios.find((s: any) => s.id === id);

        if (!sc)
        {
            id = 'scn_' + Date.now();
            sc = { id: id, name: 'Scenario ' + (scenarios.length + 1), steps: [], loopCount: 1, createdAt: Date.now(), updatedAt: Date.now() };
            scenarios.push(sc);
            localStorage.setItem('rag.currentScenarioId', id);
        }

        sc.steps.push({ type: 'announcement', stateJson: JSON.stringify(RAG.state), gapMs: 1500 });
        sc.updatedAt = Date.now();
        localStorage.setItem('rag.scenarios', JSON.stringify(scenarios));
        if (RAG.dashboard)
            RAG.dashboard.refresh();
        RAG.views.marquee.set('Captured step ' + sc.steps.length + ' into "' + sc.name + '"');
    }

    /**
     * Writes the current announcement back into the selected scenario step
     * (the one opened for editing from the dashboard).
     */
    private handleUpdateStep() : void
    {
        let id = localStorage.getItem('rag.currentScenarioId');
        let idxStr = localStorage.getItem('rag.selectedStepIndex');
        if (!id || idxStr === null) { alert('No scenario/step selected. Open the dashboard and click a step first.'); return; }

        let idx = parseInt(idxStr);
        let raw = localStorage.getItem('rag.scenarios');
        if (!raw) { alert('No scenarios saved yet.'); return; }

        let scenarios = JSON.parse(raw) as any[];
        let sc = scenarios.find((s: any) => s.id === id);
        if (!sc || !sc.steps[idx]) { alert('Step not found.'); return; }

        sc.steps[idx].stateJson = JSON.stringify(RAG.state);
        sc.updatedAt = Date.now();
        localStorage.setItem('rag.scenarios', JSON.stringify(scenarios));
        if (RAG.dashboard)
            RAG.dashboard.refresh();
        RAG.views.marquee.set('Updated step ' + (idx + 1) + ' in "' + sc.name + '"');
    }
}
