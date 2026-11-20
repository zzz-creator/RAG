/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */

/**
 * Controller for the top toolbar of the step editor view: Play, Stop,
 * Shuffle (regenerate), Update Step, and Close.
 *
 * Both pages (index.html and screen.html) carry the identical toolbar.
 * The dashboard role reveals it only while editing a step; the screen
 * role hides it at boot, so its buttons are never used there.
 */
class Toolbar
{
    private readonly dom         : HTMLElement;
    private readonly btnPlay     : HTMLButtonElement;
    private readonly btnStop     : HTMLButtonElement;
    private readonly btnGenerate : HTMLButtonElement;
    private readonly btnUpdateStep : HTMLButtonElement;
    private readonly btnClose    : HTMLButtonElement;

    public constructor()
    {
        this.dom           = DOM.require('#toolbar');
        this.btnPlay       = DOM.require('#btnPlay');
        this.btnStop       = DOM.require('#btnStop');
        this.btnGenerate   = DOM.require('#btnShuffle');
        this.btnUpdateStep = DOM.require('#btnUpdateStep');
        this.btnClose       = DOM.require('#btnClose');

        this.btnPlay.onclick     = this.handlePlay.bind(this);
        this.btnStop.onclick     = this.handleStop.bind(this);
        this.btnGenerate.onclick = this.handleGenerate.bind(this);
        this.btnUpdateStep.onclick = this.handleUpdateStep.bind(this);
        this.btnClose.onclick    = this.handleClose.bind(this);

        if (!RAG.config.clickedGenerate)
        {
            this.btnGenerate.classList.add('throb');
            this.btnGenerate.focus();
        }
        else
            this.btnPlay.focus();
    }

    /** Plays the current announcement through the speech engine */
    private handlePlay() : void
    {
        RAG.speech.stop();
        this.btnPlay.disabled = true;
        window.setTimeout(this.handlePlay2.bind(this), 200);
    }

    private handlePlay2() : void
    {
        let hasSpoken   = false;
        let speechText  = RAG.views.editor.getText();
        this.btnPlay.hidden = true;
        this.btnPlay.disabled = false;
        this.btnStop.hidden = false;

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
        this.btnStop.focus();
    }

    private handleStop(ev?: Event) : void
    {
        RAG.speech.onspeak  = undefined;
        RAG.speech.onstop   = undefined;
        this.btnPlay.hidden = false;
        if (document.activeElement === this.btnStop)
            this.btnPlay.focus();
        this.btnStop.hidden = true;
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

    /**
     * Writes the current announcement back into the selected scenario step
     * (the one opened for editing from the dashboard), then closes the
     * editor view to return to the scenario dashboard.
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
        RAG.dashboard.closeEdit();
    }

    /**
     * Close request from the ✕ button: the dashboard closes straight away
     * if the step has no unsaved changes, and asks first otherwise.
     */
    private handleClose() : void
    {
        RAG.dashboard.requestClose();
    }
}
