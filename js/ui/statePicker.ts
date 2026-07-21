/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="viewBase.ts"/>

/** Controller for the state save/load picker dialog */
class StatePicker extends ViewBase
{
    private readonly inputNumber  : HTMLInputElement;
    private readonly inputName    : HTMLInputElement;
    private readonly domPreview   : HTMLElement;
    private readonly pWarning     : HTMLElement;
    private readonly btnAction    : HTMLButtonElement;
    private readonly btnDelete    : HTMLButtonElement;
    private readonly btnCancel    : HTMLButtonElement;
    private readonly domList      : HTMLUListElement;

    private mode: 'save' | 'load' = 'save';
    private states: { [key: number]: { name: string, data: string } } = {};

    public constructor()
    {
        super('#statePicker');

        this.inputNumber = this.attach<HTMLInputElement>('#statePickerValue');
        this.inputName   = this.attach<HTMLInputElement>('#statePickerName');
        this.domPreview  = this.attach<HTMLElement>('#statePickerPreview');
        this.pWarning    = this.attach<HTMLElement>('#statePickerWarning');
        this.btnAction   = this.attach<HTMLButtonElement>('#btnStateAction');
        this.btnDelete   = this.attach<HTMLButtonElement>('#btnStateDelete');
        this.btnCancel   = this.attach<HTMLButtonElement>('#btnStateCancel');
        this.domList     = this.attach<HTMLUListElement>('#statePickerList');

        this.btnAction.onclick = this.handleAction.bind(this);
        this.btnDelete.onclick = this.handleDelete.bind(this);
        this.btnCancel.onclick = this.close.bind(this);
        this.inputNumber.oninput = this.handleInput.bind(this);
        this.inputName.oninput = this.handleNameInput.bind(this);
        
        // Load initial states from localStorage
        this.loadStates();
    }
    
    private loadStates(): void {
        let raw = window.localStorage.getItem('states');
        if (raw) {
            try {
                let parsed = JSON.parse(raw);
                this.states = {};
                for (let key in parsed) {
                    let val = parsed[key];
                    if (typeof val === 'string') {
                        this.states[parseInt(key)] = { name: `State ${key}`, data: val };
                    } else {
                        this.states[parseInt(key)] = val;
                    }
                }
            } catch (e) {
                this.states = {};
            }
        } else {
            this.states = {};
        }
    }
    
    private saveStates(): void {
        window.localStorage.setItem('states', JSON.stringify(this.states));
    }

    public open(mode: 'save' | 'load') : void
    {
        this.loadStates();
        this.mode = mode;
        this.inputNumber.value = '';
        this.inputName.value = '';
        this.domPreview.innerText = '';
        this.pWarning.hidden = true;
        
        if (this.mode === 'save') {
            this.btnAction.innerText = 'Save';
            this.btnAction.disabled = true; // Wait for valid input
        } else {
            this.btnAction.innerText = 'Load';
            this.btnAction.disabled = true;
        }

        this.btnDelete.hidden = true;
        
        this.layout();
        this.dom.hidden = false;
        
        // Prevent interaction with rest of UI while modal is open
        RAG.views.main.style.pointerEvents = 'none';
        
        this.refreshList();
        this.inputNumber.focus();
    }

    private refreshList(): void {
        this.domList.innerHTML = '';
        let keys = Object.keys(this.states).map(k => parseInt(k)).sort((a, b) => a - b);
        
        if (keys.length === 0) {
            let li = document.createElement('li');
            li.innerText = 'No states saved yet.';
            li.style.padding = '5px';
            li.style.color = '#888';
            this.domList.appendChild(li);
            return;
        }

        keys.forEach(key => {
            let stateObj = this.states[key];
            let name = stateObj.name || `State ${key}`;
            let li = document.createElement('li');
            li.innerText = `${key}: ${name}`;
            li.style.padding = '5px';
            li.style.cursor = 'pointer';
            li.style.borderBottom = '1px solid #444';
            
            li.onmouseover = () => li.style.backgroundColor = '#444';
            li.onmouseout = () => li.style.backgroundColor = 'transparent';
            
            li.onclick = () => {
                this.inputNumber.value = key.toString();
                this.handleInput();
            };
            this.domList.appendChild(li);
        });
    }

    public close(ev?: Event) : void
    {
        if (ev) ev.preventDefault();
        this.dom.hidden = true;
        RAG.views.main.style.pointerEvents = '';
        
        if (this.mode === 'save') {
            RAG.views.toolbar.btnSave.focus();
        } else {
            RAG.views.toolbar.btnRecall.focus();
        }
    }
    
    private layout() : void {
        let docW       = document.body.clientWidth;
        let docH       = document.body.clientHeight;
        let dialogX    = DOM.isMobile ? 0 : ( (docW * 0.1) / 2 ) | 0;
        let dialogY    = DOM.isMobile ? 0 : ( (docH * 0.1) / 2 ) | 0;
        
        if (DOM.isMobile) {
            this.dom.style.width = `100%`;
        }
        
        this.dom.style.left = dialogX + 'px';
        this.dom.style.top  = dialogY + 'px';
        this.dom.style.zIndex = '9999';
    }

    private handleNameInput(): void {
        // Just trigger input handler if in save mode, as name affects nothing in load
    }

    private handleInput(): void {
        let val = parseInt(this.inputNumber.value);
        if (isNaN(val) || val < 1) {
            this.btnAction.disabled = true;
            this.btnDelete.hidden = true;
            this.pWarning.hidden = true;
            this.domPreview.innerText = '';
            return;
        }
        
        let stateObj = this.states[val];
        let exists = (stateObj !== undefined);
        this.btnDelete.hidden = !exists;
        
        if (exists) {
            this.domPreview.innerText = this.previewStateText(stateObj.data);
        } else {
            this.domPreview.innerText = '';
        }
        
        if (this.mode === 'save') {
            this.btnAction.disabled = false;
            this.pWarning.hidden = !exists;
            if (exists) {
                this.pWarning.innerText = 'Warning: State already exists and will be overwritten!';
                this.pWarning.style.color = '#ffaa00';
            }
        } else {
            // Load mode
            this.btnAction.disabled = !exists;
            this.pWarning.hidden = exists; // If doesn't exist, show warning
            if (!exists) {
                this.pWarning.innerText = 'State does not exist.';
                this.pWarning.style.color = '#ff5555';
            }
        }
    }

    private previewStateText(stateJson: string): string {
        try {
            let oldState = RAG.state;
            RAG.state = Object.assign(new State(), JSON.parse(stateJson)) as State;
            
            let tempDom = document.createElement('div');
            tempDom.innerHTML = '<phraseset ref="root" />';
            RAG.phraser.process(tempDom);
            let compiledText = DOM.getCleanedVisibleText(tempDom);
            
            RAG.state = oldState;
            
            return compiledText;
        } catch (e) {
            return "Error compiling preview: " + e.message;
        }
    }

    private handleAction(ev: Event): void {
        ev.preventDefault();
        let val = parseInt(this.inputNumber.value);
        if (isNaN(val) || val < 1) return;
        
        if (this.mode === 'save') {
            try {
                let name = this.inputName.value.trim() || `State ${val}`;
                this.states[val] = {
                    name: name,
                    data: JSON.stringify(RAG.state)
                };
                this.saveStates();
                RAG.views.marquee.set(`Saved to State ${val}`);
                this.close();
            } catch (e) {
                RAG.views.marquee.set( L.STATE_SAVE_FAIL(e.message) );
            }
        } else {
            let stateObj = this.states[val];
            if (stateObj && stateObj.data) {
                RAG.load(stateObj.data);
                this.close();
            }
        }
    }
    
    private handleDelete(ev: Event): void {
        ev.preventDefault();
        let val = parseInt(this.inputNumber.value);
        if (isNaN(val) || val < 1) return;
        
        if (this.states[val]) {
            delete this.states[val];
            this.saveStates();
            RAG.views.marquee.set(`Deleted State ${val}`);
            this.inputNumber.value = '';
            this.refreshList();
            this.handleInput();
        }
    }
}
