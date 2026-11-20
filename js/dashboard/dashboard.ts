/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */

interface DashStep
{
    type: 'announcement' | 'wait';
    stateJson?: string;
    gapMs: number;
    waitSeconds?: number;
}

interface DashScenario
{
    id: string;
    name: string;
    steps: DashStep[];
    loopCount: number;
    createdAt: number;
    updatedAt: number;
}

class ScenarioDashboard
{
    private storageKey = 'rag.scenarios';
    private scenarios: DashScenario[] = [];
    private currentId: string | null = null;
    /** True while the step editor view is open (a step is being edited) */
    public editing = false;
    /** Serialized state as it was when editing began; null when not editing. Differs from the live state while the editor is dirty */
    private editSnapshot: string | null = null;
    private panel: HTMLElement;
    private progressTextEl: HTMLElement | null = null;
    private progressFillEl: HTMLElement | null = null;
    /** Inner span of the now-playing line (the scroll target) */
    private nowPlayingSpan: HTMLElement | null = null;
    /** rAF handle of the running now-playing scroll, 0 when idle */
    private nowPlayingTimer: number = 0;
    /** Current x offset (px) of the now-playing scroll */
    private nowPlayingOffset: number = 0;

    public constructor()
    {
        this.panel = DOM.require('#scenarioDashboard');
        this.loadAll();

        // Restore the last selected scenario, or default to the first one
        let savedId = localStorage.getItem('rag.currentScenarioId');
        if (savedId && this.scenarios.some(s => s.id === savedId))
            this.currentId = savedId;
        else if (this.scenarios.length > 0)
            this.currentId = this.scenarios[0].id;

        RAG.scenario.onStep = (idx: number, total: number) =>
        {
            this.updateProgress(idx, total);
            this.highlightStep(idx);
        };

        RAG.scenario.onComplete = () =>
        {
            this.onPlaybackEnded();
            this.setNowPlaying('Scenario finished.', true);
            RAG.views.marquee.set('Scenario finished.');
        };

        RAG.scenario.onError = (msg: string) =>
        {
            this.onPlaybackEnded();
            alert('Scenario error: ' + msg);
            this.setNowPlaying('Scenario stopped: ' + msg, false);
            RAG.views.marquee.set('Scenario stopped: ' + msg, false);
        };

        // The panel covers the main screen, so mirror what is being
        // announced (and any wait countdown) inside it.
        RAG.scenario.onTextUpdate = (text: string) =>
        {
            this.setNowPlaying(text);
        };

        RAG.scenario.onWaitCountdown = (remaining: number) =>
        {
            this.setNowPlaying('Waiting ' + remaining + 's...');
        };

        // Another tab (or this tab's own toolbar) may have written newer
        // scenarios; re-read them so the panel never clobbers them.
        window.addEventListener('storage', (e: StorageEvent) =>
        {
            if (e.key === 'rag.scenarios' || e.key === 'rag.currentScenarioId')
                this.refresh();
        });

        this.render();
    }

    /**
     * Shows the dashboard view — panel up, editor hidden. Called at boot
     * when this page is running in the dashboard role: the dashboard is
     * the default entry view, and the editor appears only on Edit.
     */
    public open(): void
    {
        this.showDashboard();
        this.render();
    }

    /**
     * Opens the step editor view: hides the panel so the phrase editor on
     * this same dashboard page is revealed with its toolbar. The panel's
     * Play/Stop are the scenario triggers; the toolbar's Play/Stop speak
     * the single announcement being edited.
     */
    public openEdit(): void
    {
        this.showEditor();
    }

    /**
     * Closes the step editor view: re-shows the dashboard panel and
     * re-reads the scenarios so anything saved from the editor is
     * reflected.
     */
    public closeEdit(): void
    {
        this.showDashboard();
        this.refresh();
    }

    /**
     * Close request from the editor's ✕ button or ESC: closes straight
     * away if the step being edited has no unsaved changes, and asks the
     * user first otherwise — closing would discard what they changed.
     */
    public requestClose(): void
    {
        if (this.isDirty() && !confirm('Discard unsaved changes?'))
            return;
        this.closeEdit();
    }

    /** True if the announcement in the editor differs from the state the step being edited held when it was opened */
    public isDirty(): boolean
    {
        if (this.editSnapshot === null)
            return false;
        return JSON.stringify(RAG.state) !== this.editSnapshot;
    }

    /** Switches to the dashboard view: panel up, editor hidden */
    private showDashboard(): void
    {
        this.editing = false;
        this.editSnapshot = null;
        this.panel.hidden = false;
        RAG.views.main.hidden = true;
    }

    /** Switches to the step editor view: editor up, panel hidden */
    private showEditor(): void
    {
        this.editing = true;
        this.panel.hidden = true;
        RAG.views.main.hidden = false;
    }

    /**
     * Re-reads scenarios from localStorage and re-renders. Called after
     * anything writes the scenarios out from under this instance's in-
     * memory copy (the toolbar's Capture/Update Step buttons, another tab).
     */
    public refresh(): void
    {
        this.loadAll();
        if (!this.current())
        {
            this.currentId = this.scenarios.length > 0 ? this.scenarios[0].id : null;
            if (this.currentId)
                localStorage.setItem('rag.currentScenarioId', this.currentId);
        }
        this.render();
    }

    /**
     * Updates the "now playing" line inside the panel, scrolling the text
     * through it like the main marquee (the panel covers #marquee, so this
     * line is what is actually visible during playback). While a scroll is
     * already running, new text simply swaps in without restarting, so the
     * wait countdown ticks smoothly instead of jumping to the right edge.
     */
    private setNowPlaying(text: string, animate: boolean = true): void
    {
        let el = this.panel.querySelector('#dashNowPlaying') as HTMLElement | null;
        if (!el)
            return;

        let span = el.querySelector('span') as HTMLElement | null;
        if (!span)
        {
            el.textContent = '';
            span = document.createElement('span');
            el.appendChild(span);
        }

        if (span !== this.nowPlayingSpan)
        {
            // The panel was re-rendered (new span): drop any running scroll
            window.cancelAnimationFrame(this.nowPlayingTimer);
            this.nowPlayingTimer = 0;
            this.nowPlayingSpan = span;
        }

        span.textContent = text;

        if (!animate)
        {
            window.cancelAnimationFrame(this.nowPlayingTimer);
            this.nowPlayingTimer = 0;
            span.style.transform = '';
            return;
        }

        if (this.nowPlayingTimer !== 0)
            return;

        // Same mechanics as Marquee.set: enter from the right, exit left,
        // then rest at the left edge
        this.nowPlayingOffset = el.clientWidth;
        this.nowPlayingTimer = window.requestAnimationFrame(() => this.scrollNowPlaying());
    }

    /** One frame of the now-playing scroll */
    private scrollNowPlaying(): void
    {
        let span = this.nowPlayingSpan;
        if (!span || !span.parentNode)
        {
            this.nowPlayingTimer = 0;
            return;
        }

        this.nowPlayingOffset -= 6;
        span.style.transform = `translateX(${this.nowPlayingOffset}px)`;

        let limit = -span.clientWidth - 100;
        if (this.nowPlayingOffset < limit)
        {
            // The whole message has passed: let it rest at the left edge
            span.style.transform = '';
            this.nowPlayingTimer = 0;
        }
        else
        {
            this.nowPlayingTimer = window.requestAnimationFrame(() => this.scrollNowPlaying());
        }
    }

    private loadAll(): void
    {
        try
        {
            let raw = localStorage.getItem(this.storageKey);
            let parsed = raw ? JSON.parse(raw) as DashScenario[] : [];
            if (!Array.isArray(parsed))
                parsed = [];
            this.scenarios = parsed;
            this.scenarios.forEach(sc =>
            {
                if (sc.steps)
                    sc.steps.forEach(st => this.cleanStep(st));
            });
        }
        catch (e)
        {
            this.scenarios = [];
        }
    }

    /**
     * Strips fields the app no longer uses (branching and step labels,
     * removed 2026-11-14) so old saves and imports stay clean.
     */
    private cleanStep(st: any): void
    {
        delete st.branches;
        delete st.branch;
        delete st.label;
    }

    private saveAll(): void
    {
        localStorage.setItem(this.storageKey, JSON.stringify(this.scenarios));
    }

    private current(): DashScenario | null
    {
        return this.scenarios.find(s => s.id === this.currentId) || null;
    }

    /** Escapes user-entered text before it is interpolated into HTML */
    private esc(v: string): string
    {
        return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Playback ─────────────────────────────────────────────────────────

    private startPlayback(): void
    {
        let s = this.current();
        if (!s || s.steps.length === 0)
        {
            alert('This scenario has no steps yet. Capture or add some first.');
            return;
        }

        this.setEditingEnabled(false);

        RAG.scenario.clear();
        RAG.scenario.setSteps(s.steps as any);
        RAG.scenario.setLoopCount(s.loopCount);
        RAG.scenario.play();
    }

    private stopPlayback(): void
    {
        RAG.scenario.stop();
        this.onPlaybackEnded();
        this.setNowPlaying('Playback stopped.', false);
        RAG.views.marquee.set('Playback stopped.');
    }

    /** Plays a single step once (announcement or wait), then stops */
    private playStepOnly(idx: number): void
    {
        let s = this.current();
        if (!s || !s.steps[idx])
        {
            alert('This scenario has no steps yet. Capture or add some first.');
            return;
        }

        this.setEditingEnabled(false);

        RAG.scenario.clear();
        RAG.scenario.setSteps(s.steps as any);
        RAG.scenario.playStep(idx);
        RAG.views.marquee.set('Playing step ' + (idx + 1) + ' only.');
    }

    private onPlaybackEnded(): void
    {
        this.setEditingEnabled(true);
        this.highlightStep(-1);
        this.updateProgress(-1, 0);
        this.setNowPlaying('Idle', false);
    }

    /** Locks this tab's own main screen while a scenario is playing */
    private setEditingEnabled(on: boolean): void
    {
        if (RAG.views)
            RAG.views.main.style.pointerEvents = on ? '' : 'none';

        let toolbar = document.getElementById('toolbar');
        if (toolbar)
            toolbar.style.pointerEvents = on ? '' : 'none';
    }

    // ── Progress and highlight ───────────────────────────────────────────

    private updateProgress(idx: number, total: number): void
    {
        if (!this.progressTextEl || !this.progressFillEl)
            return;

        if (idx < 0)
        {
            this.progressTextEl.textContent = 'Idle';
            this.progressFillEl.style.width = '0%';
            return;
        }

        let pct = total > 0 ? Math.round(((idx + 1) / total) * 100) : 0;
        this.progressTextEl.textContent = 'Step ' + (idx + 1) + ' of ' + total;
        this.progressFillEl.style.width = pct + '%';
    }

    private highlightStep(idx: number): void
    {
        this.panel.querySelectorAll('.dash-step').forEach((el, i) =>
        {
            el.classList.toggle('running', i === idx);
        });
    }

    // ── Rendering ────────────────────────────────────────────────────────

    public render(): void
    {
        let s = this.current();

        let listHtml = this.scenarios.map(sc =>
        {
            let cls = sc.id === this.currentId ? 'dash-scen active' : 'dash-scen';
            return `<li class="${cls}" data-id="${this.esc(sc.id)}">${this.esc(sc.name)} <span class="dash-scen-meta">${sc.steps.length} steps</span></li>`;
        }).join('');

        let stepsHtml = '';
        if (s)
        {
            let sc = s;
            stepsHtml = sc.steps.map((st, i) => this.stepHtml(sc, st, i)).join('');
        }

        this.panel.innerHTML =
        `<div class="dash">
            <h1>Scenario Dashboard</h1>
            <div class="dash-row dash-head">
                <button id="dashSettings" type="button" title="Open the settings screen">Settings</button>
                <button id="dashOpenDisplay" type="button" title="Open the announcement display (screen.html) in a new tab">Open display</button>
            </div>

            <h2>Scenarios</h2>
            <ul>${listHtml}</ul>
            <div class="dash-row">
                <button id="dashNew" type="button">New scenario</button>
            </div>

            <section class="dash-editor">
                ${s ? this.editorHtml(s, stepsHtml) : '<p class="dash-hint">Select a scenario above, or create a new one.</p>'}
            </section>
        </div>`;

        this.progressTextEl = this.panel.querySelector('#dashProgressText');
        this.progressFillEl = this.panel.querySelector('#dashProgressFill');
        this.bind();
    }

    private editorHtml(s: DashScenario, stepsHtml: string): string
    {
        let stepsList = stepsHtml.length > 0
            ? stepsHtml
            : '<p class="dash-hint">No steps yet. Capture the current announcement, or add a wait step.</p>';

        return `<div class="dash-row">
                <label class="dash-field">Name <input id="dashName" type="text" value="${this.esc(s.name)}"></label>
                <label class="dash-field">Loop count <input id="dashLoop" type="number" value="${s.loopCount}" min="1" title="How many times to repeat the whole scenario"></label>
            </div>
            <div class="dash-row">
                <button id="dashAddStep" type="button" title="Add the current announcement as a step">Capture step</button>
                <button id="dashAddWait" type="button" title="Add a silent pause">Add wait step</button>
                <button id="dashImport" type="button">Import JSON</button>
                <button id="dashExport" type="button">Export JSON</button>
            </div>
            <h2>Steps</h2>
            <div class="dash-steps">${stepsList}</div>
            <div class="dash-run">
                <div class="dash-nowplaying" id="dashNowPlaying">Idle</div>
                <div class="dash-row">
                    <button id="dashPlay" type="button">Play</button>
                    <button id="dashStop" type="button">Stop</button>
                </div>
                <div class="dash-progress">
                    <span id="dashProgressText">Idle</span>
                    <div class="dash-progress-bar"><div class="dash-progress-fill" id="dashProgressFill"></div></div>
                </div>
            </div>`;
    }

    private stepHtml(s: DashScenario, st: DashStep, i: number): string
    {
        let title = st.type === 'wait' ? ('Wait ' + (st.waitSeconds || 0) + 's') : ('Step ' + (i + 1));
        let gapInput = st.type === 'announcement'
            ? `<label class="dash-field">Gap (ms) <input class="dash-gap" type="number" data-idx="${i}" value="${st.gapMs}" min="0" step="100" title="Pause after this step, in milliseconds"></label>`
            : '';
        let waitInput = st.type === 'wait'
            ? `<label class="dash-field">Wait (s) <input class="dash-wait" type="number" data-idx="${i}" value="${st.waitSeconds || 0}" min="0" step="1" title="Silent pause, in seconds"></label>`
            : '';
        let annButtons = st.type === 'announcement'
            ? `<button class="dash-edit" type="button" data-idx="${i}" title="Open this step in the editor to change it">Edit</button>`
            : '';

        return `<div class="dash-step" data-idx="${i}">
            <div class="dash-step-title"><span>${title}</span></div>
            <div class="dash-row">
                ${gapInput}
                ${waitInput}
                <span class="dash-row-btns">
                    <button class="dash-up" type="button" data-idx="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="dash-down" type="button" data-idx="${i}" title="Move down" ${i === s.steps.length - 1 ? 'disabled' : ''}>↓</button>
                    <button class="dash-stepplay" type="button" data-idx="${i}" title="Play only this step">▶</button>
                    ${annButtons}
                    <button class="dash-del" type="button" data-idx="${i}" title="Delete this step">✕</button>
                </span>
            </div>
        </div>`;
    }

    // ── Event binding ────────────────────────────────────────────────────

    private bind(): void
    {
        let panel = this.panel;

        panel.querySelectorAll('.dash-scen').forEach(li =>
        {
            (li as HTMLElement).addEventListener('click', () =>
            {
                this.currentId = (li as HTMLElement).dataset['id'] || null;
                if (this.currentId)
                    localStorage.setItem('rag.currentScenarioId', this.currentId);
                this.render();
            });
        });

        let btnSettings = panel.querySelector('#dashSettings') as HTMLButtonElement | null;
        if (btnSettings)
            btnSettings.onclick = () => RAG.views.settings.open();

        let btnOpenDisplay = panel.querySelector('#dashOpenDisplay') as HTMLButtonElement | null;
        if (btnOpenDisplay)
            btnOpenDisplay.onclick = () => window.open('screen.html', '_blank');

        let btnNew = panel.querySelector('#dashNew') as HTMLButtonElement | null;
        if (btnNew)
            btnNew.onclick = () =>
            {
                let id = 'scn_' + Date.now();
                this.scenarios.push({ id: id, name: 'Scenario ' + (this.scenarios.length + 1), steps: [], loopCount: 1, createdAt: Date.now(), updatedAt: Date.now() });
                this.currentId = id;
                localStorage.setItem('rag.currentScenarioId', id);
                this.saveAll();
                this.render();
            };

        let btnAdd = panel.querySelector('#dashAddStep') as HTMLButtonElement | null;
        if (btnAdd)
            btnAdd.onclick = () => this.captureStep();

        let btnWait = panel.querySelector('#dashAddWait') as HTMLButtonElement | null;
        if (btnWait)
            btnWait.onclick = () =>
            {
                let s = this.current();
                if (!s)
                    return;
                s.steps.push({ type: 'wait', gapMs: 0, waitSeconds: 3 });
                s.updatedAt = Date.now();
                this.saveAll();
                this.render();
            };

        panel.querySelectorAll('.dash-up').forEach(b =>
        {
            (b as HTMLElement).addEventListener('click', () => this.moveStep(b as HTMLElement, -1));
        });

        panel.querySelectorAll('.dash-down').forEach(b =>
        {
            (b as HTMLElement).addEventListener('click', () => this.moveStep(b as HTMLElement, 1));
        });

        panel.querySelectorAll('.dash-del').forEach(b =>
        {
            (b as HTMLElement).addEventListener('click', () => this.deleteStep(b as HTMLElement));
        });

        panel.querySelectorAll('.dash-edit').forEach(b =>
        {
            (b as HTMLElement).addEventListener('click', () => this.editStep(parseInt((b as HTMLElement).dataset['idx'] || '0', 10)));
        });

        panel.querySelectorAll('.dash-stepplay').forEach(b =>
        {
            (b as HTMLElement).addEventListener('click', () =>
            {
                let idx = parseInt((b as HTMLElement).dataset['idx'] || '0', 10);
                this.playStepOnly(idx);
            });
        });

        panel.querySelectorAll('.dash-gap').forEach(inp =>
        {
            (inp as HTMLElement).addEventListener('change', () =>
            {
                let idx = parseInt((inp as HTMLElement).dataset['idx'] || '0', 10);
                let s = this.current();
                if (!s)
                    return;
                s.steps[idx].gapMs = parseInt((inp as HTMLInputElement).value, 10) || 0;
                s.updatedAt = Date.now();
                this.saveAll();
            });
        });

        panel.querySelectorAll('.dash-wait').forEach(inp =>
        {
            (inp as HTMLElement).addEventListener('change', () =>
            {
                let idx = parseInt((inp as HTMLElement).dataset['idx'] || '0', 10);
                let s = this.current();
                if (!s)
                    return;
                s.steps[idx].waitSeconds = parseInt((inp as HTMLInputElement).value, 10) || 0;
                s.updatedAt = Date.now();
                this.saveAll();
                this.render();
            });
        });

        let nameInput = panel.querySelector('#dashName') as HTMLInputElement | null;
        if (nameInput)
        {
            let el = nameInput;
            el.addEventListener('change', () =>
            {
                let s = this.current();
                if (!s)
                    return;
                s.name = el.value;
                s.updatedAt = Date.now();
                this.saveAll();
                this.render();
            });
        }

        let loopInput = panel.querySelector('#dashLoop') as HTMLInputElement | null;
        if (loopInput)
        {
            let el = loopInput;
            el.addEventListener('change', () =>
            {
                let s = this.current();
                if (!s)
                    return;
                s.loopCount = parseInt(el.value, 10) || 1;
                s.updatedAt = Date.now();
                this.saveAll();
            });
        }

        let btnPlay = panel.querySelector('#dashPlay') as HTMLButtonElement | null;
        if (btnPlay)
            btnPlay.onclick = () => this.startPlayback();

        let btnStop = panel.querySelector('#dashStop') as HTMLButtonElement | null;
        if (btnStop)
            btnStop.onclick = () => this.stopPlayback();

        let btnExport = panel.querySelector('#dashExport') as HTMLButtonElement | null;
        if (btnExport)
            btnExport.onclick = () => this.exportJson();

        let btnImport = panel.querySelector('#dashImport') as HTMLButtonElement | null;
        if (btnImport)
            btnImport.onclick = () => this.importJson();
    }

    // ── Step operations ──────────────────────────────────────────────────

    /**
     * Adds the live announcement as a new step. Prefers a sibling tab's state
     * (asked for over the channel, answered by the editor role); falls back
     * to this tab's own state when no other tab answers within 1.2s (i.e.
     * building directly on the dashboard page).
     */
    private captureStep(): void
    {
        let captured = false;
        let nonce = 'cap_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);

        let handler = (msg: any) =>
        {
            if (captured || !msg || msg.nonce !== nonce || !msg.stateJson)
                return;
            captured = true;
            if (RAG.channel)
                RAG.channel.off('CAPTURED_STEP_DATA', handler);
            this.pushStep(msg.stateJson);
        };

        if (RAG.channel)
        {
            RAG.channel.on('CAPTURED_STEP_DATA', handler);
            RAG.channel.send('CAPTURE_STEP_REQUEST', { nonce: nonce });
        }

        window.setTimeout(() =>
        {
            if (RAG.channel)
                RAG.channel.off('CAPTURED_STEP_DATA', handler);
            if (!captured)
                this.pushStep(JSON.stringify(RAG.state));
        }, 1200);
    }

    private pushStep(stateJson: string): void
    {
        let s = this.current();
        if (!s)
        {
            alert('Select a scenario first.');
            return;
        }

        s.steps.push({ type: 'announcement', stateJson: stateJson, gapMs: 1500 });
        s.updatedAt = Date.now();
        this.saveAll();
        this.render();
        RAG.views.marquee.set('Captured step ' + s.steps.length + ' into "' + s.name + '"');
    }

    /**
     * Opens this step in the step editor view: loads its announcement into
     * the editor on this same dashboard page, then reveals it with its
     * toolbar. "Update Step" writes back to this step — the keys set below
     * are what it targets. No new tab, so the dashboard tab keeps owning
     * the audio and the voice is never doubled.
     */
    private editStep(idx: number): void
    {
        let s = this.current();
        if (!s || !s.steps[idx])
            return;
        let step = s.steps[idx];
        if (step.type !== 'announcement' || !step.stateJson)
        {
            alert('This step has no announcement state to edit.');
            return;
        }

        localStorage.setItem('rag.currentScenarioId', s.id);
        localStorage.setItem('rag.selectedStepIndex', String(idx));

        RAG.load(step.stateJson);
        // Snapshot after load: the dirty check compares the live state
        // against this, so the step's own state reads as clean.
        this.editSnapshot = JSON.stringify(RAG.state);
        this.openEdit();
        RAG.views.marquee.set('Editing step ' + (idx + 1) + ' of "' + s.name + '". Make your changes, then click "Update Step" to save them back.');
    }

    private moveStep(btn: HTMLElement, dir: number): void
    {
        let idx = parseInt(btn.dataset['idx'] || '0', 10);
        let s = this.current();
        if (!s)
            return;
        let to = idx + dir;
        if (to < 0 || to >= s.steps.length)
            return;

        let tmp = s.steps[to];
        s.steps[to] = s.steps[idx];
        s.steps[idx] = tmp;
        s.updatedAt = Date.now();
        this.saveAll();
        this.render();
    }

    private deleteStep(btn: HTMLElement): void
    {
        let idx = parseInt(btn.dataset['idx'] || '0', 10);
        let s = this.current();
        if (!s)
            return;
        if (!confirm('Delete this step?'))
            return;

        s.steps.splice(idx, 1);
        s.updatedAt = Date.now();
        this.saveAll();
        this.render();
    }

    // ── Import / export ──────────────────────────────────────────────────

    private exportJson(): void
    {
        let payload = JSON.stringify(this.scenarios, null, 2);
        let blob = new Blob([payload], { type: 'application/json' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = 'rag-scenarios.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private importJson(): void
    {
        let input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json, .json';
        input.onchange = async () =>
        {
            let file = input.files && input.files[0];
            if (!file)
                return;
            let f = file;

            let text = await new Promise<string>(resolve =>
            {
                let reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => resolve('');
                reader.readAsText(f);
            });
            if (text === '')
                return;

            try
            {
                let imported = JSON.parse(text) as DashScenario[];
                if (!Array.isArray(imported))
                    throw new Error('Expected an array of scenarios');

                imported.forEach(sc =>
                {
                    if (!sc.id)
                        sc.id = 'scn_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
                    if (!sc.steps)
                        sc.steps = [];
                    sc.steps.forEach(st => this.cleanStep(st));
                    if (!sc.loopCount)
                        sc.loopCount = 1;
                    if (!sc.createdAt)
                        sc.createdAt = Date.now();
                    if (!sc.updatedAt)
                        sc.updatedAt = Date.now();
                });

                this.scenarios = this.scenarios.concat(imported);
                if (this.currentId === null && this.scenarios.length > 0)
                    this.currentId = this.scenarios[this.scenarios.length - 1].id;
                this.saveAll();
                this.render();
                RAG.views.marquee.set('Imported ' + imported.length + ' scenario(s).');
            }
            catch (e)
            {
                alert('Invalid JSON: expected an array of scenarios.');
            }
        };
        input.click();
    }
}

(window as any).ScenarioDashboard = ScenarioDashboard;
