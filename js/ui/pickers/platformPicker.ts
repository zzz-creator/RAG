/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the platform picker dialog */
class PlatformPicker extends Picker
{
    /** Reference to this picker's numerical input spinner */
    private readonly inputDigit  : HTMLInputElement;
    /** Reference to this picker's letter drop-down input control */
    private readonly inputLetter : HTMLSelectElement;

    public constructor()
    {
        super('platform');

        this.inputDigit          = DOM.require('input', this.dom);
        this.inputLetter         = DOM.require('select', this.dom);
        this.domHeader.innerText = L.HEADER_PLATFORM;

        // iOS needs different type and pattern to show a numerical keyboard
        if (DOM.isiOS)
        {
            this.inputDigit.type    = 'tel';
            this.inputDigit.pattern = '[0-9]+';
        }
    }

    /** Populates the form with the current state's platform data */
    public open(target: HTMLElement) : void
    {
        super.open(target);

        let value = RAG.state.platform;

        this.inputDigit.value  = value[0];
        this.inputLetter.value = value[1];
        this.updateLetterVisibility();
        this.inputDigit.focus();
    }

    /** Updates the platform element and state currently being edited */
    protected onChange(_: Event) : void
    {
        let intVal = parseInt(this.inputDigit.value);
        // Ignore invalid values
        if ( isNaN( intVal ) )
            return;
            
        if (intVal < 0) { intVal = 0; this.inputDigit.value = '0'; }
        if (intVal > 60) { intVal = 60; this.inputDigit.value = '60'; }

        this.updateLetterVisibility();

        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];

        RAG.views.editor.setElementsText( 'platform', RAG.state.platform.join('') );
    }

    /** Hides and clears the letter selector if platform number is > 26 */
    private updateLetterVisibility() : void
    {
        let intVal = parseInt(this.inputDigit.value);
        let hide   = isNaN(intVal) || intVal > 26;

        this.inputLetter.hidden   = hide;
        if (hide)
        {
            this.inputLetter.value    = '';
        }
    }

    protected onClick(_: MouseEvent)    : void { /* no-op */ }
    protected onInput(_: KeyboardEvent) : void { /* no-op */ }
}