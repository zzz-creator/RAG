/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */

///<reference path="viewBase.ts"/>

/** Controller for the disclaimer screen */
class Disclaimer extends ViewBase
{
    /** Reference to the "continue" button */
    private readonly btnDismiss : HTMLButtonElement = this.attach('#btnDismiss');

    /** Reference to the last focused element, if any */
    private lastActive? : HTMLElement;

    public constructor()
    {
        super('#disclaimerScreen');
    }

    /** Opens the disclaimer for first time users */
    public disclaim() : void
    {
        if (RAG.config.readDisclaimer)
            return;

        this.lastActive         = document.activeElement as HTMLElement;
        RAG.views.main.hidden   = true;
        this.dom.hidden         = false;
        this.btnDismiss.onclick = this.onDismiss.bind(this);
        this.btnDismiss.focus();
    }

    /** Persists the dismissal to storage and restores the view underneath */
    private onDismiss() : void
    {
        RAG.config.readDisclaimer = true;
        this.dom.hidden           = true;
        // Dashboard role: the editor view stays hidden — the panel is what
        // shows. Screen role: restore the marquee editor.
        RAG.views.main.hidden     = RAG.isDashboardRole();
        this.btnDismiss.onclick   = null;
        RAG.config.save();

        if (this.lastActive)
        {
            this.lastActive.focus();
            this.lastActive = undefined;
        }
    }
}