"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Global reference to the language container, set at init */
let L;
class I18n {
    /** Picks a language, and transforms all translation keys in the document */
    static init() {
        if (this.languages)
            throw new Error('I18n is already initialized');
        this.languages = {
            'en': new EnglishLanguage()
        };
        // TODO: Language selection
        L = this.currentLang = this.languages['en'];
        I18n.applyToDom();
    }
    /**
     * Walks through all text nodes in the DOM, replacing any translation keys.
     *
     * @see https://stackoverflow.com/a/10730777/3354920
     */
    static applyToDom() {
        let next;
        let walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: I18n.nodeFilter }, false);
        while (next = walk.nextNode()) {
            if (next.nodeType === Node.ELEMENT_NODE) {
                let element = next;
                for (let i = 0; i < element.attributes.length; i++)
                    I18n.expandAttribute(element.attributes[i]);
            }
            else if (next.nodeType === Node.TEXT_NODE && next.textContent)
                I18n.expandTextNode(next);
        }
    }
    /** Filters the tree walker to exclude script and style tags */
    static nodeFilter(node) {
        let tag = (node.nodeType === Node.ELEMENT_NODE)
            ? node.tagName.toUpperCase()
            : node.parentElement.tagName.toUpperCase();
        return ['SCRIPT', 'STYLE'].includes(tag)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
    }
    /** Expands any translation keys in the given attribute */
    static expandAttribute(attr) {
        // Setting an attribute, even if nothing actually changes, will cause various
        // side-effects (e.g. reloading iframes). So, as wasteful as this looks, we have
        // to match first before actually replacing.
        if (attr.value.match(this.TAG_REGEX))
            attr.value = attr.value.replace(this.TAG_REGEX, I18n.replace);
    }
    /** Expands any translation keys in the given text node */
    static expandTextNode(node) {
        node.textContent = node.textContent.replace(this.TAG_REGEX, I18n.replace);
    }
    /** Replaces key with value if it exists, else keeps the key */
    static replace(match) {
        let key = match.slice(1, -1);
        let value = L[key];
        if (!value) {
            console.error('Missing translation key:', match);
            return match;
        }
        else
            return (typeof value === 'function')
                ? value()
                : value;
    }
}
/** Constant regex to match for translation keys */
I18n.TAG_REGEX = /%[A-Z_]+%/;
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** UI element with a filterable and keyboard navigable list of choices */
class Chooser {
    /** Creates a chooser, by replacing the placeholder in a given parent */
    constructor(parent) {
        /** Whether to visually select the clicked element */
        this.selectOnClick = true;
        /** Reference to the auto-filter timeout, if any */
        this.filterTimeout = 0;
        /** Whether to group added elements by alphabetical sections */
        this.groupByABC = false;
        /** Title attribute to apply to every item added */
        this.itemTitle = 'Click to select this item';
        if (!Chooser.TEMPLATE)
            Chooser.init();
        let target = DOM.require('chooser', parent);
        let placeholder = DOM.getAttr(target, 'placeholder', L.P_GENERIC_PH);
        let title = DOM.getAttr(target, 'title', L.P_GENERIC_T);
        this.itemTitle = DOM.getAttr(target, 'itemTitle', this.itemTitle);
        this.groupByABC = target.hasAttribute('groupByABC');
        this.dom = Chooser.TEMPLATE.cloneNode(true);
        this.inputFilter = DOM.require('.chSearchBox', this.dom);
        this.inputChoices = DOM.require('.chChoicesBox', this.dom);
        this.inputChoices.title = title;
        this.inputFilter.placeholder = placeholder;
        // TODO: Reusing the placeholder as title is probably bad
        // https://laken.net/blog/most-common-a11y-mistakes/
        this.inputFilter.title = placeholder;
        target.insertAdjacentElement('beforebegin', this.dom);
        target.remove();
    }
    /** Creates and detaches the template on first create */
    static init() {
        Chooser.TEMPLATE = DOM.require('#chooserTemplate');
        Chooser.TEMPLATE.id = '';
        Chooser.TEMPLATE.hidden = false;
        Chooser.TEMPLATE.remove();
    }
    /**
     * Adds the given value to the chooser as a selectable item.
     *
     * @param value Text of the selectable item
     * @param select Whether to select this item once added
     */
    add(value, select = false) {
        let item = document.createElement('dd');
        item.innerText = value;
        this.addRaw(item, select);
    }
    /**
     * Adds the given element to the chooser as a selectable item.
     *
     * @param item Element to add to the chooser
     * @param select Whether to select this item once added
     */
    addRaw(item, select = false) {
        item.title = this.itemTitle;
        item.tabIndex = -1;
        this.inputChoices.appendChild(item);
        if (select) {
            this.visualSelect(item);
            item.focus();
        }
    }
    /** Clears all items from this chooser and the current filter */
    clear() {
        this.inputChoices.innerHTML = '';
        this.inputFilter.value = '';
    }
    /** Select and focus the entry that matches the given value */
    preselect(value) {
        for (let key in this.inputChoices.children) {
            let item = this.inputChoices.children[key];
            if (value === item.innerText) {
                this.visualSelect(item);
                item.focus();
                break;
            }
        }
    }
    /** Handles pickers' click events, for choosing items */
    onClick(ev) {
        let target = ev.target;
        if (this.isChoice(target))
            if (!target.hasAttribute('disabled'))
                this.select(target);
    }
    /** Handles pickers' close methods, doing any timer cleanup */
    onClose() {
        window.clearTimeout(this.filterTimeout);
    }
    /** Handles pickers' input events, for filtering and navigation */
    onInput(ev) {
        let key = ev.key;
        let focused = document.activeElement;
        let parent = focused.parentElement;
        if (!focused)
            return;
        // Only handle events on this chooser's controls
        if (!this.owns(focused))
            return;
        // Handle typing into filter box
        if (focused === this.inputFilter) {
            window.clearTimeout(this.filterTimeout);
            this.filterTimeout = window.setTimeout(_ => this.filter(), 500);
            return;
        }
        // Redirect typing to input filter box
        if (focused !== this.inputFilter)
            if (key.length === 1 || key === 'Backspace')
                return this.inputFilter.focus();
        // Handle pressing ENTER after keyboard navigating to an item
        if (this.isChoice(focused))
            if (key === 'Enter')
                return this.select(focused);
        // Handle navigation when container or item is focused
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav = null;
            // Navigate relative to currently focused element, if using groups
            if (this.groupByABC && parent.hasAttribute('group'))
                nav = DOM.getNextFocusableSibling(focused, dir);
            // Navigate relative to currently focused element, if choices are flat
            else if (!this.groupByABC && focused.parentElement === this.inputChoices)
                nav = DOM.getNextFocusableSibling(focused, dir);
            // Navigate relative to currently selected element
            else if (focused === this.domSelected)
                nav = DOM.getNextFocusableSibling(this.domSelected, dir);
            // Navigate relevant to beginning or end of container
            else if (dir === -1)
                nav = DOM.getNextFocusableSibling(focused.firstElementChild, dir);
            else
                nav = DOM.getNextFocusableSibling(focused.lastElementChild, dir);
            if (nav)
                nav.focus();
        }
    }
    /** Handles pickers' submit events, for instant filtering */
    onSubmit(ev) {
        ev.preventDefault();
        this.filter();
    }
    /** Hide or show choices if they partially match the user query */
    filter() {
        window.clearTimeout(this.filterTimeout);
        let filter = this.inputFilter.value.toLowerCase();
        let items = this.inputChoices.children;
        let engine = this.groupByABC
            ? Chooser.filterGroup
            : Chooser.filterItem;
        // Prevent browser redraw/reflow during filtering
        // TODO: Might the use of hidden break A11y here? (e.g. defocus)
        this.inputChoices.hidden = true;
        // Iterate through all the items
        for (let i = 0; i < items.length; i++)
            engine(items[i], filter);
        this.inputChoices.hidden = false;
    }
    /** Applies filter to an item, showing it if matched, hiding if not */
    static filterItem(item, filter) {
        // Show if contains search term
        if (item.innerText.toLowerCase().indexOf(filter) >= 0) {
            item.hidden = false;
            return 0;
        }
        // Hide if not
        else {
            item.hidden = true;
            return 1;
        }
    }
    /** Applies filter to children of a group, hiding the group if all children hide */
    static filterGroup(group, filter) {
        let entries = group.children;
        let count = entries.length - 1; // -1 for header element
        let hidden = 0;
        // Iterate through each station name in this letter section. Header skipped.
        for (let i = 1; i < entries.length; i++)
            hidden += Chooser.filterItem(entries[i], filter);
        // If all station names in this letter section were hidden, hide the section
        if (hidden >= count)
            group.hidden = true;
        else
            group.hidden = false;
    }
    /** Visually changes the current selection, and updates the state and editor */
    select(entry) {
        let alreadySelected = (entry === this.domSelected);
        if (this.selectOnClick)
            this.visualSelect(entry);
        if (this.onSelect)
            this.onSelect(entry);
        if (alreadySelected)
            RAG.views.editor.closeDialog();
    }
    /** Visually changes the currently selected element */
    visualSelect(entry) {
        this.visualUnselect();
        this.domSelected = entry;
        this.domSelected.tabIndex = 50;
        entry.setAttribute('selected', 'true');
    }
    /** Visually unselects the currently selected element, if any */
    visualUnselect() {
        if (!this.domSelected)
            return;
        this.domSelected.removeAttribute('selected');
        this.domSelected.tabIndex = -1;
        this.domSelected = undefined;
    }
    /**
     * Whether this chooser is an ancestor (owner) of the given element.
     *
     * @param target Element to check if this chooser is an ancestor of
     */
    owns(target) {
        return this.dom.contains(target);
    }
    /** Whether the given element is a choosable one owned by this chooser */
    isChoice(target) {
        return target !== undefined
            && target.tagName.toLowerCase() === 'dd'
            && this.owns(target);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** UI element for toggling the state of collapsible editor elements */
class CollapseToggle {
    /** Creates and detaches the template on first create */
    static init() {
        CollapseToggle.TEMPLATE = DOM.require('#collapsibleButtonTemplate');
        CollapseToggle.TEMPLATE.id = '';
        CollapseToggle.TEMPLATE.hidden = false;
        CollapseToggle.TEMPLATE.remove();
    }
    /** Creates and attaches toggle element for toggling collapsibles */
    static createAndAttach(parent) {
        // Skip if a toggle is already attached
        if (parent.querySelector('.toggle'))
            return;
        if (!CollapseToggle.TEMPLATE)
            CollapseToggle.init();
        parent.insertAdjacentElement('afterbegin', CollapseToggle.TEMPLATE.cloneNode(true));
    }
    /** Updates the given collapse toggle's title text, depending on state */
    static update(span) {
        let ref = span.dataset['ref'] || '???';
        let type = span.dataset['type'];
        let state = span.hasAttribute('collapsed');
        let toggle = DOM.require('.toggle', span);
        toggle.title = state
            ? L.TITLE_OPT_OPEN(type, ref)
            : L.TITLE_OPT_CLOSE(type, ref);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** UI element for opening the picker for phraseset editor elements */
class PhrasesetButton {
    /** Creates and detaches the template on first create */
    static init() {
        // TODO: This is being duplicated in various places; DRY with sugar method
        PhrasesetButton.TEMPLATE = DOM.require('#phrasesetButtonTemplate');
        PhrasesetButton.TEMPLATE.id = '';
        PhrasesetButton.TEMPLATE.hidden = false;
        PhrasesetButton.TEMPLATE.remove();
    }
    /** Creates and attaches a button for the given phraseset element */
    static createAndAttach(phraseset) {
        // Skip if a button is already attached
        if (phraseset.querySelector('.choosePhrase'))
            return;
        if (!PhrasesetButton.TEMPLATE)
            PhrasesetButton.init();
        let ref = DOM.requireData(phraseset, 'ref');
        let button = PhrasesetButton.TEMPLATE.cloneNode(true);
        button.title = L.TITLE_PHRASESET(ref);
        phraseset.insertAdjacentElement('afterbegin', button);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
///<reference path="chooser.ts"/>
// TODO: Search by station code
/**
 * Singleton instance of the station picker. Since there are expected to be 2500+
 * stations, this element would take up a lot of memory and generate a lot of DOM. So, it
 * has to be "swapped" between pickers and views that want to use it.
 */
class StationChooser extends Chooser {
    constructor(parent) {
        super(parent);
        /** Shortcut references to all the generated A-Z station list elements */
        this.domStations = {};
        this.inputChoices.tabIndex = 0;
        // Populates the list of stations from the database. We do this by creating a dl
        // element for each letter of the alphabet, creating a dt element header, and then
        // populating the dl with station name dd children.
        Object.keys(RAG.database.stations).forEach(this.addStation.bind(this));
    }
    /**
     * Attaches this control to the given parent and resets some state.
     *
     * @param picker Picker to attach this control to
     * @param onSelect Delegate to fire when choosing a station
     */
    attach(picker, onSelect) {
        let parent = picker.domForm;
        let current = this.dom.parentElement;
        // Re-enable all disabled elements
        this.inputChoices.querySelectorAll(`dd[disabled]`)
            .forEach(this.enable.bind(this));
        if (!current || current !== parent)
            parent.appendChild(this.dom);
        this.visualUnselect();
        this.onSelect = onSelect.bind(picker);
    }
    /** Pre-selects a station entry by its code */
    preselectCode(code) {
        let entry = this.getByCode(code);
        if (!entry)
            return;
        this.visualSelect(entry);
        entry.focus();
    }
    /** Enables the given station code or station element for selection */
    enable(codeOrNode) {
        let entry = (typeof codeOrNode === 'string')
            ? this.getByCode(codeOrNode)
            : codeOrNode;
        if (!entry)
            return;
        entry.removeAttribute('disabled');
        entry.tabIndex = -1;
        entry.title = this.itemTitle;
    }
    /** Disables the given station code from selection */
    disable(code) {
        let entry = this.getByCode(code);
        let next = DOM.getNextFocusableSibling(entry, 1);
        if (!entry)
            return;
        entry.setAttribute('disabled', '');
        entry.removeAttribute('tabindex');
        entry.title = '';
        // Shift focus to next available element, for keyboard navigation
        if (next)
            next.focus();
    }
    /** Gets a station's choice element by its code */
    getByCode(code) {
        return this.inputChoices
            .querySelector(`dd[data-code=${code}]`);
    }
    /** Populates the chooser with the given station code */
    addStation(code) {
        let station = RAG.database.getStation(code);
        let letter = station[0];
        let group = this.domStations[letter];
        if (!group) {
            let header = document.createElement('dt');
            header.innerText = letter.toUpperCase();
            header.tabIndex = -1;
            group = this.domStations[letter] = document.createElement('dl');
            group.tabIndex = 50;
            group.setAttribute('group', '');
            group.appendChild(header);
            this.inputChoices.appendChild(group);
        }
        let entry = document.createElement('dd');
        entry.dataset['code'] = code;
        entry.innerText = station;
        entry.title = this.itemTitle;
        entry.tabIndex = -1;
        group.appendChild(entry);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Station list item that can be dragged and dropped */
class StationListItem {
    /** Creates and detaches the template on first create */
    static init() {
        StationListItem.TEMPLATE = DOM.require('#stationListItemTemplate');
        StationListItem.TEMPLATE.id = '';
        StationListItem.TEMPLATE.hidden = false;
        StationListItem.TEMPLATE.remove();
    }
    /**
     * Creates a station list item, meant for the station list builder.
     *
     * @param code Three-letter station code to create this item for
     */
    constructor(code) {
        if (!StationListItem.TEMPLATE)
            StationListItem.init();
        this.dom = StationListItem.TEMPLATE.cloneNode(true);
        this.dom.innerText = RAG.database.getStation(code);
        this.dom.dataset['code'] = code;
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Base class for picker views */
class Picker {
    /**
     * Creates a picker to handle the given phrase element type.
     *
     * @param {string} xmlTag Name of the XML tag this picker will handle.
     */
    constructor(xmlTag) {
        this.dom = DOM.require(`#${xmlTag}Picker`);
        this.domForm = DOM.require('form', this.dom);
        this.domHeader = DOM.require('header', this.dom);
        this.xmlTag = xmlTag;
        this.domForm.onchange = this.onChange.bind(this);
        this.domForm.oninput = this.onChange.bind(this);
        this.domForm.onclick = this.onClick.bind(this);
        this.domForm.onkeydown = this.onInput.bind(this);
        this.domForm.onsubmit = this.onSubmit.bind(this);
    }
    /**
     * Called when ENTER is pressed whilst a form control of the picker is focused.
     * By default, this will trigger the onChange handler and close the dialog.
     */
    onSubmit(ev) {
        ev.preventDefault();
        this.onChange(ev);
        RAG.views.editor.closeDialog();
    }
    /**
     * Open this picker for a given phrase element. The implementing picker should fill
     * its form elements with data from the current state and targeted element here.
     *
     * @param {HTMLElement} target Phrase element that this picker is being opened for
     */
    open(target) {
        this.dom.hidden = false;
        this.domEditing = target;
        this.layout();
    }
    /** Closes this picker */
    close() {
        this.dom.hidden = true;
    }
    /** Positions this picker relative to the target phrase element */
    layout() {
        if (!this.domEditing)
            return;
        let targetRect = this.domEditing.getBoundingClientRect();
        let fullWidth = this.dom.classList.contains('fullWidth');
        let isModal = this.dom.classList.contains('modal');
        let docW = document.body.clientWidth;
        let docH = document.body.clientHeight;
        let dialogX = (targetRect.left | 0) - 8;
        let dialogY = targetRect.bottom | 0;
        let dialogW = (targetRect.width | 0) + 16;
        // Adjust if horizontally off screen
        if (!fullWidth && !isModal) {
            // Force full width on mobile
            if (DOM.isMobile) {
                this.dom.style.width = `100%`;
                dialogX = 0;
            }
            else {
                this.dom.style.width = `initial`;
                this.dom.style.minWidth = `${dialogW}px`;
                if (dialogX + this.dom.offsetWidth > docW)
                    dialogX = (targetRect.right | 0) - this.dom.offsetWidth + 8;
            }
        }
        // Handle pickers that instead take up the whole display. CSS isn't used here,
        // because percentage-based left/top causes subpixel issues on Chrome.
        if (isModal) {
            dialogX = DOM.isMobile ? 0 : ((docW * 0.1) / 2) | 0;
            dialogY = DOM.isMobile ? 0 : ((docH * 0.1) / 2) | 0;
        }
        // Clamp to top edge of document
        else if (dialogY < 0)
            dialogY = 0;
        // Adjust if vertically off screen
        else if (dialogY + this.dom.offsetHeight > docH) {
            dialogY = (targetRect.top | 0) - this.dom.offsetHeight + 1;
            this.domEditing.classList.add('below');
            this.domEditing.classList.remove('above');
            // If still off-screen, clamp to bottom
            if (dialogY + this.dom.offsetHeight > docH)
                dialogY = docH - this.dom.offsetHeight;
            // Clamp to top edge of document. Likely happens if target element is large.
            if (dialogY < 0)
                dialogY = 0;
        }
        else {
            this.domEditing.classList.add('above');
            this.domEditing.classList.remove('below');
        }
        this.dom.style.left = (fullWidth ? 0 : dialogX) + 'px';
        this.dom.style.top = dialogY + 'px';
    }
    /** Returns true if an element in this picker currently has focus */
    hasFocus() {
        return this.dom.contains(document.activeElement);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the coach picker dialog */
class CoachPicker extends Picker {
    constructor() {
        super('coach');
        /** Holds the context for the current coach element being edited */
        this.currentCtx = '';
        this.inputLetter = DOM.require('select', this.dom);
        for (let i = 0; i < 26; i++)
            DOM.addOption(this.inputLetter, L.LETTERS[i], L.LETTERS[i]);
    }
    /** Populates the form with the target context's coach letter */
    open(target) {
        super.open(target);
        this.currentCtx = DOM.requireData(target, 'context');
        this.domHeader.innerText = L.HEADER_COACH(this.currentCtx);
        this.inputLetter.value = RAG.state.getCoach(this.currentCtx);
        this.inputLetter.focus();
    }
    /** Updates the coach element and state currently being edited */
    onChange(_) {
        RAG.state.setCoach(this.currentCtx, this.inputLetter.value);
        RAG.views.editor
            .getElementsByQuery(`[data-type=coach][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = this.inputLetter.value);
    }
    onClick(_) { }
    onInput(_) { }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the excuse picker dialog */
class ExcusePicker extends Picker {
    constructor() {
        super('excuse');
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        this.domHeader.innerText = L.HEADER_EXCUSE;
        RAG.database.excuses.forEach(v => this.domChooser.add(v));
    }
    /** Populates the chooser with the current state's excuse */
    open(target) {
        super.open(target);
        // Pre-select the currently used excuse
        this.domChooser.preselect(RAG.state.excuse);
    }
    /** Close this picker */
    close() {
        super.close();
        this.domChooser.onClose();
    }
    // Forward these events to the chooser
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    /** Handles chooser selection by updating the excuse element and state */
    onSelect(entry) {
        RAG.state.excuse = entry.innerText;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the integer picker dialog */
class IntegerPicker extends Picker {
    constructor() {
        super('integer');
        /** Holds the context for the current integer element being edited */
        this.currentCtx = '';
        this.inputDigit = DOM.require('input', this.dom);
        this.domLabel = DOM.require('label', this.dom);
        // iOS needs different type and pattern to show a numerical keyboard
        if (DOM.isiOS) {
            this.inputDigit.type = 'tel';
            this.inputDigit.pattern = '[0-9]+';
        }
    }
    /** Populates the form with the target context's integer data */
    open(target) {
        super.open(target);
        this.currentCtx = DOM.requireData(target, 'context');
        this.singular = target.dataset['singular'];
        this.plural = target.dataset['plural'];
        this.words = Parse.boolean(target.dataset['words'] || 'false');
        let value = RAG.state.getInteger(this.currentCtx);
        if (this.singular && value === 1)
            this.domLabel.innerText = this.singular;
        else if (this.plural && value !== 1)
            this.domLabel.innerText = this.plural;
        else
            this.domLabel.innerText = '';
        this.domHeader.innerText = L.HEADER_INTEGER(this.currentCtx);
        if (this.currentCtx === 'coaches') {
            this.inputDigit.min = '0';
            this.inputDigit.max = '60';
        }
        else {
            this.inputDigit.removeAttribute('min');
            this.inputDigit.removeAttribute('max');
        }
        this.inputDigit.value = value.toString();
        this.inputDigit.focus();
    }
    /** Updates the integer element and state currently being edited */
    onChange(_) {
        // Can't use valueAsNumber due to iOS input type workarounds
        let int = parseInt(this.inputDigit.value);
        // Ignore invalid values
        if (isNaN(int))
            return;
        if (this.currentCtx === 'coaches') {
            if (int < 0) {
                int = 0;
                this.inputDigit.value = '0';
            }
            if (int > 60) {
                int = 60;
                this.inputDigit.value = '60';
            }
        }
        let intStr = (this.words)
            ? L.DIGITS[int] || int.toString()
            : int.toString();
        this.domLabel.innerText = '';
        if (int === 1 && this.singular) {
            intStr += ` ${this.singular}`;
            this.domLabel.innerText = this.singular;
        }
        else if (int !== 1 && this.plural) {
            intStr += ` ${this.plural}`;
            this.domLabel.innerText = this.plural;
        }
        RAG.state.setInteger(this.currentCtx, int);
        RAG.views.editor
            .getElementsByQuery(`[data-type=integer][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = intStr);
    }
    onClick(_) { }
    onInput(_) { }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the named train picker dialog */
class NamedPicker extends Picker {
    constructor() {
        super('named');
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        this.domHeader.innerText = L.HEADER_NAMED;
        RAG.database.named.forEach(v => this.domChooser.add(v));
    }
    /** Populates the chooser with the current state's named train */
    open(target) {
        super.open(target);
        // Pre-select the currently used name
        this.domChooser.preselect(RAG.state.named);
    }
    /** Close this picker */
    close() {
        super.close();
        this.domChooser.onClose();
    }
    // Forward these events to the chooser
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    /** Handles chooser selection by updating the named element and state */
    onSelect(entry) {
        RAG.state.named = entry.innerText;
        RAG.views.editor.setElementsText('named', RAG.state.named);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the phraseset picker dialog */
class PhrasesetPicker extends Picker {
    constructor() {
        super('phraseset');
        /** Holds the reference tag for the current phraseset element being edited */
        this.currentRef = '';
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
    }
    /** Populates the chooser with the current phraseset's list of phrases */
    open(target) {
        super.open(target);
        let ref = DOM.requireData(target, 'ref');
        let idx = parseInt(DOM.requireData(target, 'idx'));
        let phraseset = assert(RAG.database.getPhraseset(ref));
        this.currentRef = ref;
        this.domHeader.innerText = L.HEADER_PHRASESET(ref);
        this.domChooser.clear();
        // For each phrase, we need to run it through the phraser using the current state
        // to generate "previews" of how the phrase will look.
        for (let i = 0; i < phraseset.children.length; i++) {
            let phrase = document.createElement('dd');
            DOM.cloneInto(phraseset.children[i], phrase);
            RAG.phraser.process(phrase);
            phrase.innerText = DOM.getCleanedVisibleText(phrase);
            phrase.dataset.idx = i.toString();
            this.domChooser.addRaw(phrase, i === idx);
        }
    }
    /** Close this picker */
    close() {
        super.close();
        this.domChooser.onClose();
    }
    // Forward these events to the chooser
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    /** Handles chooser selection by updating the phraseset element and state */
    onSelect(entry) {
        let idx = parseInt(entry.dataset['idx']);
        RAG.state.setPhrasesetIdx(this.currentRef, idx);
        RAG.views.editor.closeDialog();
        RAG.views.editor.refreshPhraseset(this.currentRef);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the platform picker dialog */
class PlatformPicker extends Picker {
    constructor() {
        super('platform');
        this.inputDigit = DOM.require('input', this.dom);
        this.inputLetter = DOM.require('select', this.dom);
        this.domHeader.innerText = L.HEADER_PLATFORM;
        // iOS needs different type and pattern to show a numerical keyboard
        if (DOM.isiOS) {
            this.inputDigit.type = 'tel';
            this.inputDigit.pattern = '[0-9]+';
        }
    }
    /** Populates the form with the current state's platform data */
    open(target) {
        super.open(target);
        let value = RAG.state.platform;
        this.inputDigit.value = value[0];
        this.inputLetter.value = value[1];
        this.updateLetterVisibility();
        this.inputDigit.focus();
    }
    /** Updates the platform element and state currently being edited */
    onChange(_) {
        let intVal = parseInt(this.inputDigit.value);
        // Ignore invalid values
        if (isNaN(intVal))
            return;
        if (intVal < 0) {
            intVal = 0;
            this.inputDigit.value = '0';
        }
        if (intVal > 60) {
            intVal = 60;
            this.inputDigit.value = '60';
        }
        this.updateLetterVisibility();
        // 'M' (9¾) is only valid for platform 9
        if (intVal !== 9 && this.inputLetter.value === 'M')
            this.inputLetter.value = '';
        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];
        RAG.views.editor.setElementsText('platform', (RAG.state.platform[1] === 'M')
            ? RAG.state.platform[0] + '¾'
            : RAG.state.platform.join(''));
    }
    /** Hides and clears the letter selector if platform number is > 26 */
    updateLetterVisibility() {
        let intVal = parseInt(this.inputDigit.value);
        let hide = isNaN(intVal) || intVal > 26;
        this.inputLetter.hidden = hide;
        if (hide) {
            this.inputLetter.value = '';
        }
        // Only platform 9 has a "9¾" (M) pronunciation
        let mOption = this.inputLetter.querySelector('option[value="M"]');
        if (mOption) {
            mOption.hidden = !(intVal === 9);
            mOption.disabled = !(intVal === 9);
            if (intVal !== 9 && this.inputLetter.value === 'M')
                this.inputLetter.value = '';
        }
    }
    onClick(_) { }
    onInput(_) { }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the service picker dialog */
class ServicePicker extends Picker {
    constructor() {
        super('service');
        /** Holds the context for the current service element being edited */
        this.currentCtx = '';
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        RAG.database.services.forEach(v => this.domChooser.add(v));
    }
    /** Populates the chooser with the current state's service */
    open(target) {
        super.open(target);
        this.currentCtx = DOM.requireData(target, 'context');
        this.domHeader.innerText = L.HEADER_SERVICE(this.currentCtx);
        // Pre-select the currently used service
        this.domChooser.preselect(RAG.state.getService(this.currentCtx));
    }
    /** Close this picker */
    close() {
        super.close();
        this.domChooser.onClose();
    }
    // Forward these events to the chooser
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    /** Handles chooser selection by updating the service element and state */
    onSelect(entry) {
        RAG.state.setService(this.currentCtx, entry.innerText);
        RAG.views.editor
            .getElementsByQuery(`[data-type=service][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = entry.innerText);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the station picker dialog */
class StationPicker extends Picker {
    constructor(tag = 'station') {
        super(tag);
        /** Holds the context for the current station element being edited */
        this.currentCtx = '';
        if (!StationPicker.chooser)
            StationPicker.chooser = new StationChooser(this.domForm);
        this.onOpen = this.onStationPickerOpen.bind(this);
    }
    /** Fires the onOpen delegate registered for this picker */
    open(target) {
        super.open(target);
        this.onOpen(target);
    }
    /** Attaches the station chooser and focuses it onto the current element's station */
    onStationPickerOpen(target) {
        let chooser = StationPicker.chooser;
        this.currentCtx = DOM.requireData(target, 'context');
        chooser.attach(this, this.onSelectStation);
        chooser.preselectCode(RAG.state.getStation(this.currentCtx));
        chooser.selectOnClick = true;
        this.domHeader.innerText = L.HEADER_STATION(this.currentCtx);
    }
    // Forward these events to the station chooser
    onChange(_) { }
    onClick(ev) { StationPicker.chooser.onClick(ev); }
    onInput(ev) { StationPicker.chooser.onInput(ev); }
    onSubmit(ev) { StationPicker.chooser.onSubmit(ev); }
    /** Handles chooser selection by updating the station element and state */
    onSelectStation(entry) {
        let query = `[data-type=station][data-context=${this.currentCtx}]`;
        let code = entry.dataset['code'];
        let name = RAG.database.getStation(code);
        RAG.state.setStation(this.currentCtx, code);
        RAG.views.editor
            .getElementsByQuery(query)
            .forEach(element => element.textContent = name);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/// <reference path="stationPicker.ts"/>
/// <reference path="../../vendor/draggable.d.ts"/>
/** Controller for the station list picker dialog */
class StationListPicker extends StationPicker {
    constructor() {
        super("stationlist");
        this.domList = DOM.require('.stationList', this.dom);
        this.btnAdd = DOM.require('.addStation', this.domList);
        this.btnClose = DOM.require('.closePicker', this.domList);
        this.domDel = DOM.require('.delStation', this.domList);
        this.inputList = DOM.require('dl', this.domList);
        this.domEmptyList = DOM.require('p', this.domList);
        this.onOpen = this.onStationListPickerOpen.bind(this);
        new Draggable.Sortable([this.inputList, this.domDel], { draggable: 'dd' })
            // Have to use timeout, to let Draggable finish sorting the list
            .on('drag:stop', ev => setTimeout(() => this.onDragStop(ev), 1))
            .on('mirror:create', this.onDragMirrorCreate.bind(this));
    }
    /**
     * Populates the station list builder, with the selected list. Because this picker
     * extends from StationList, this handler overrides the 'onOpen' delegate property
     * of StationList.
     *
     * @param target Station list editor element to open for
     */
    onStationListPickerOpen(target) {
        // Since we share the station picker with StationList, grab it
        StationPicker.chooser.attach(this, this.onAddStation);
        StationPicker.chooser.selectOnClick = false;
        this.currentCtx = DOM.requireData(target, 'context');
        let entries = RAG.state.getStationList(this.currentCtx).slice();
        this.domHeader.innerText = L.HEADER_STATIONLIST(this.currentCtx);
        // Remove all old list elements
        this.inputList.innerHTML = '';
        // Finally, populate list from the clicked station list element
        entries.forEach(v => this.add(v));
        this.inputList.focus();
    }
    // Forward these events to the chooser
    onSubmit(ev) { super.onSubmit(ev); }
    /** Handles pickers' click events, for choosing items */
    onClick(ev) {
        super.onClick(ev);
        if (ev.target === this.btnClose)
            RAG.views.editor.closeDialog();
        // For mobile users, switch to station chooser screen if "Add..." was clicked
        if (ev.target === this.btnAdd)
            this.dom.classList.add('addingStation');
    }
    /** Handles keyboard navigation for the station list builder */
    onInput(ev) {
        super.onInput(ev);
        let key = ev.key;
        let focused = document.activeElement;
        // Only handle the station list builder control
        if (!focused || !this.inputList.contains(focused))
            return;
        // Handle keyboard navigation
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav = null;
            // Navigate relative to focused element
            if (focused.parentElement === this.inputList)
                nav = DOM.getNextFocusableSibling(focused, dir);
            // Navigate relevant to beginning or end of container
            else if (dir === -1)
                nav = DOM.getNextFocusableSibling(focused.firstElementChild, dir);
            else
                nav = DOM.getNextFocusableSibling(focused.lastElementChild, dir);
            if (nav)
                nav.focus();
        }
        // Handle entry deletion
        if (key === 'Delete' || key === 'Backspace')
            if (focused.parentElement === this.inputList) {
                // Focus on next element or parent on delete
                let next = focused.previousElementSibling
                    || focused.nextElementSibling
                    || this.inputList;
                this.remove(focused);
                next.focus();
            }
    }
    /** Handler for when a station is chosen */
    onAddStation(entry) {
        let newEntry = this.add(entry.dataset['code']);
        // Switch back to builder screen, if on mobile
        this.dom.classList.remove('addingStation');
        this.update();
        // Focus only if on mobile, since the station list is on a dedicated screen
        if (DOM.isMobile)
            newEntry.dom.focus();
        else
            newEntry.dom.scrollIntoView();
    }
    /** Fixes mirrors not having correct width of the source element, on create */
    onDragMirrorCreate(ev) {
        ev.data.source.style.width = ev.data.originalSource.clientWidth + 'px';
    }
    /** Handles draggable station name being dropped */
    onDragStop(ev) {
        if (!ev.data.originalSource)
            return;
        if (ev.data.originalSource.parentElement === this.domDel)
            this.remove(ev.data.originalSource);
        else
            this.update();
    }
    /**
     * Creates and adds a new entry for the builder list.
     *
     * @param code Three-letter station code to create an item for
     */
    add(code) {
        let newEntry = new StationListItem(code);
        // Add the new entry to the sortable list
        this.inputList.appendChild(newEntry.dom);
        this.domEmptyList.hidden = true;
        // Disable the added station in the chooser
        StationPicker.chooser.disable(code);
        // Delete item on double click
        newEntry.dom.ondblclick = _ => this.remove(newEntry.dom);
        return newEntry;
    }
    /**
     * Removes the given station entry element from the builder.
     *
     * @param entry Element of the station entry to remove
     */
    remove(entry) {
        if (!this.domList.contains(entry))
            throw Error('Attempted to remove entry not on station list builder');
        // Enabled the removed station in the chooser
        StationPicker.chooser.enable(entry.dataset['code']);
        entry.remove();
        this.update();
        if (this.inputList.children.length === 0)
            this.domEmptyList.hidden = false;
    }
    /** Updates the station list element and state currently being edited */
    update() {
        let children = this.inputList.children;
        // Don't update if list is empty
        if (children.length === 0)
            return;
        let list = [];
        for (let i = 0; i < children.length; i++) {
            let entry = children[i];
            list.push(entry.dataset['code']);
        }
        let textList = Strings.fromStationList(list.slice(), this.currentCtx);
        let query = `[data-type=stationlist][data-context=${this.currentCtx}]`;
        RAG.state.setStationList(this.currentCtx, list);
        RAG.views.editor
            .getElementsByQuery(query)
            .forEach(element => element.textContent = textList);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the time picker dialog */
class TimePicker extends Picker {
    constructor() {
        super('time');
        /** Holds the context for the current time element being edited */
        this.currentCtx = '';
        this.inputTime = DOM.require('input', this.dom);
    }
    /** Populates the form with the current state's time */
    open(target) {
        super.open(target);
        this.currentCtx = DOM.requireData(target, 'context');
        this.domHeader.innerText = L.HEADER_TIME(this.currentCtx);
        this.inputTime.value = RAG.state.getTime(this.currentCtx);
        this.inputTime.focus();
    }
    /** Updates the time element and state currently being edited */
    onChange(_) {
        RAG.state.setTime(this.currentCtx, this.inputTime.value);
        RAG.views.editor
            .getElementsByQuery(`[data-type=time][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = this.inputTime.value);
    }
    onClick(_) { }
    onInput(_) { }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Base class for configuration objects, that can save, load, and reset themselves */
class ConfigBase {
    constructor(type) {
        this.type = type;
    }
    /** Safely loads runtime configuration from localStorage, if any */
    load() {
        let settings = window.localStorage.getItem(ConfigBase.SETTINGS_KEY);
        if (!settings)
            return;
        try {
            let config = JSON.parse(settings);
            Object.assign(this, config);
        }
        catch (err) {
            alert(L.CONFIG_LOAD_FAIL(err.message));
            console.error(err);
        }
    }
    /** Safely saves this configuration to localStorage */
    save() {
        try {
            window.localStorage.setItem(ConfigBase.SETTINGS_KEY, JSON.stringify(this));
        }
        catch (err) {
            alert(L.CONFIG_SAVE_FAIL(err.message));
            console.error(err);
        }
    }
    /** Safely deletes this configuration from localStorage and resets state */
    reset() {
        try {
            Object.assign(this, new this.type());
            window.localStorage.removeItem(ConfigBase.SETTINGS_KEY);
        }
        catch (err) {
            alert(L.CONFIG_RESET_FAIL(err.message));
            console.error(err);
        }
    }
}
/** localStorage key where config is expected to be stored */
ConfigBase.SETTINGS_KEY = 'settings';
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
///<reference path="configBase.ts"/>
/** Holds runtime configuration for RAG */
class Config extends ConfigBase {
    constructor(autoLoad = false) {
        super(Config);
        /** If user has clicked shuffle at least once */
        this.clickedGenerate = false;
        /** If user has read the disclaimer */
        this.readDisclaimer = false;
        /** Volume for speech to be set at */
        this.speechVol = 1.0;
        /** Pitch for speech to be set at */
        this.speechPitch = 1.0;
        /** Rate for speech to be set at */
        this.speechRate = 1.0;
        /** VOX key of the chime to use prior to speaking */
        this.voxChime = '';
        /** Relative or absolute URL of the custom VOX voice to use */
        this.voxCustomPath = '';
        /** Whether to use the VOX engine */
        this.voxEnabled = true;
        /** Relative or absolute URL of the VOX voice to use */
        this.voxPath = 'https://zzz-creator.github.io/RAG-VOX-Roy';
        /** Choice of speech voice to use as voice name, or '' if unset */
        this._speechVoice = '';
        /** Impulse response to use for VOX's reverb */
        this._voxReverb = 'ir.stalbans.wav';
        if (autoLoad)
            this.load();
    }
    /**
     * Choice of speech voice to use, as a voice name. Because of the async nature of
     * getVoices, the default value will be fetched from it each time.
     */
    get speechVoice() {
        // If there's a user-defined value, use that
        if (this._speechVoice !== '')
            return this._speechVoice;
        // Select English voices by default
        let voices = RAG.speech.browserVoices;
        for (let name in voices)
            if (voices[name].lang === 'en-GB' || voices[name].lang === 'en-US')
                return name;
        // Else, first voice on the list
        return Object.keys(voices)[0];
    }
    /** Sets the choice of speech to use, as voice name */
    set speechVoice(value) {
        this._speechVoice = value;
    }
    /** Gets the impulse response file to use for VOX engine's reverb */
    get voxReverb() {
        // Reset choice of reverb if it's invalid
        let choices = Object.keys(VoxEngine.REVERBS);
        if (!choices.includes(this._voxReverb))
            this._voxReverb = choices[0];
        return this._voxReverb;
    }
    /** Sets the impulse response file to use for VOX engine's reverb */
    set voxReverb(value) {
        this._voxReverb = value;
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
class ScenarioDashboard {
    constructor() {
        this.storageKey = 'rag.scenarios';
        this.scenarios = [];
        this.currentId = null;
        /** True while the step editor view is open (a step is being edited) */
        this.editing = false;
        /** Serialized state as it was when editing began; null when not editing. Differs from the live state while the editor is dirty */
        this.editSnapshot = null;
        this.progressTextEl = null;
        this.progressFillEl = null;
        /** Inner span of the now-playing line (the scroll target) */
        this.nowPlayingSpan = null;
        /** rAF handle of the running now-playing scroll, 0 when idle */
        this.nowPlayingTimer = 0;
        /** Current x offset (px) of the now-playing scroll */
        this.nowPlayingOffset = 0;
        this.panel = DOM.require('#scenarioDashboard');
        this.loadAll();
        // Restore the last selected scenario, or default to the first one
        let savedId = localStorage.getItem('rag.currentScenarioId');
        if (savedId && this.scenarios.some(s => s.id === savedId))
            this.currentId = savedId;
        else if (this.scenarios.length > 0)
            this.currentId = this.scenarios[0].id;
        RAG.scenario.onStep = (idx, total) => {
            this.updateProgress(idx, total);
            this.highlightStep(idx);
        };
        RAG.scenario.onComplete = () => {
            this.onPlaybackEnded();
            this.setNowPlaying('Scenario finished.', true);
            RAG.views.marquee.set('Scenario finished.');
        };
        RAG.scenario.onError = (msg) => {
            this.onPlaybackEnded();
            alert('Scenario error: ' + msg);
            this.setNowPlaying('Scenario stopped: ' + msg, false);
            RAG.views.marquee.set('Scenario stopped: ' + msg, false);
        };
        // The panel covers the main screen, so mirror what is being
        // announced (and any wait countdown) inside it.
        RAG.scenario.onTextUpdate = (text) => {
            this.setNowPlaying(text);
        };
        RAG.scenario.onWaitCountdown = (remaining) => {
            this.setNowPlaying('Waiting ' + remaining + 's...');
        };
        // Another tab (or this tab's own toolbar) may have written newer
        // scenarios; re-read them so the panel never clobbers them.
        window.addEventListener('storage', (e) => {
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
    open() {
        this.showDashboard();
        this.render();
    }
    /**
     * Opens the step editor view: hides the panel so the phrase editor on
     * this same dashboard page is revealed with its toolbar. The panel's
     * Play/Stop are the scenario triggers; the toolbar's Play/Stop speak
     * the single announcement being edited.
     */
    openEdit() {
        this.showEditor();
    }
    /**
     * Closes the step editor view: re-shows the dashboard panel and
     * re-reads the scenarios so anything saved from the editor is
     * reflected.
     */
    closeEdit() {
        this.showDashboard();
        this.refresh();
    }
    /**
     * Close request from the editor's ✕ button or ESC: closes straight
     * away if the step being edited has no unsaved changes, and asks the
     * user first otherwise — closing would discard what they changed.
     */
    requestClose() {
        if (this.isDirty() && !confirm('Discard unsaved changes?'))
            return;
        this.closeEdit();
    }
    /** True if the announcement in the editor differs from the state the step being edited held when it was opened */
    isDirty() {
        if (this.editSnapshot === null)
            return false;
        return JSON.stringify(RAG.state) !== this.editSnapshot;
    }
    /** Switches to the dashboard view: panel up, editor hidden */
    showDashboard() {
        this.editing = false;
        this.editSnapshot = null;
        this.panel.hidden = false;
        RAG.views.main.hidden = true;
    }
    /** Switches to the step editor view: editor up, panel hidden */
    showEditor() {
        this.editing = true;
        this.panel.hidden = true;
        RAG.views.main.hidden = false;
    }
    /**
     * Re-reads scenarios from localStorage and re-renders. Called after
     * anything writes the scenarios out from under this instance's in-
     * memory copy (the toolbar's Capture/Update Step buttons, another tab).
     */
    refresh() {
        this.loadAll();
        if (!this.current()) {
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
    setNowPlaying(text, animate = true) {
        let el = this.panel.querySelector('#dashNowPlaying');
        if (!el)
            return;
        let span = el.querySelector('span');
        if (!span) {
            el.textContent = '';
            span = document.createElement('span');
            el.appendChild(span);
        }
        if (span !== this.nowPlayingSpan) {
            // The panel was re-rendered (new span): drop any running scroll
            window.cancelAnimationFrame(this.nowPlayingTimer);
            this.nowPlayingTimer = 0;
            this.nowPlayingSpan = span;
        }
        span.textContent = text;
        if (!animate) {
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
    scrollNowPlaying() {
        let span = this.nowPlayingSpan;
        if (!span || !span.parentNode) {
            this.nowPlayingTimer = 0;
            return;
        }
        this.nowPlayingOffset -= 6;
        span.style.transform = `translateX(${this.nowPlayingOffset}px)`;
        let limit = -span.clientWidth - 100;
        if (this.nowPlayingOffset < limit) {
            // The whole message has passed: let it rest at the left edge
            span.style.transform = '';
            this.nowPlayingTimer = 0;
        }
        else {
            this.nowPlayingTimer = window.requestAnimationFrame(() => this.scrollNowPlaying());
        }
    }
    loadAll() {
        try {
            let raw = localStorage.getItem(this.storageKey);
            let parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed))
                parsed = [];
            this.scenarios = parsed;
            this.scenarios.forEach(sc => {
                if (sc.steps)
                    sc.steps.forEach(st => this.cleanStep(st));
            });
        }
        catch (e) {
            this.scenarios = [];
        }
    }
    /**
     * Strips fields the app no longer uses (branching and step labels,
     * removed 2026-11-14) so old saves and imports stay clean.
     */
    cleanStep(st) {
        delete st.branches;
        delete st.branch;
        delete st.label;
    }
    saveAll() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.scenarios));
    }
    current() {
        return this.scenarios.find(s => s.id === this.currentId) || null;
    }
    /** Escapes user-entered text before it is interpolated into HTML */
    esc(v) {
        return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    // ── Playback ─────────────────────────────────────────────────────────
    startPlayback() {
        let s = this.current();
        if (!s || s.steps.length === 0) {
            alert('This scenario has no steps yet. Capture or add some first.');
            return;
        }
        this.setEditingEnabled(false);
        RAG.scenario.clear();
        RAG.scenario.setSteps(s.steps);
        RAG.scenario.setLoopCount(s.loopCount);
        RAG.scenario.play();
    }
    stopPlayback() {
        RAG.scenario.stop();
        this.onPlaybackEnded();
        this.setNowPlaying('Playback stopped.', false);
        RAG.views.marquee.set('Playback stopped.');
    }
    /** Plays a single step once (announcement or wait), then stops */
    playStepOnly(idx) {
        let s = this.current();
        if (!s || !s.steps[idx]) {
            alert('This scenario has no steps yet. Capture or add some first.');
            return;
        }
        this.setEditingEnabled(false);
        RAG.scenario.clear();
        RAG.scenario.setSteps(s.steps);
        RAG.scenario.playStep(idx);
        RAG.views.marquee.set('Playing step ' + (idx + 1) + ' only.');
    }
    onPlaybackEnded() {
        this.setEditingEnabled(true);
        this.highlightStep(-1);
        this.updateProgress(-1, 0);
        this.setNowPlaying('Idle', false);
    }
    /** Locks this tab's own main screen while a scenario is playing */
    setEditingEnabled(on) {
        if (RAG.views)
            RAG.views.main.style.pointerEvents = on ? '' : 'none';
        let toolbar = document.getElementById('toolbar');
        if (toolbar)
            toolbar.style.pointerEvents = on ? '' : 'none';
    }
    // ── Progress and highlight ───────────────────────────────────────────
    updateProgress(idx, total) {
        if (!this.progressTextEl || !this.progressFillEl)
            return;
        if (idx < 0) {
            this.progressTextEl.textContent = 'Idle';
            this.progressFillEl.style.width = '0%';
            return;
        }
        let pct = total > 0 ? Math.round(((idx + 1) / total) * 100) : 0;
        this.progressTextEl.textContent = 'Step ' + (idx + 1) + ' of ' + total;
        this.progressFillEl.style.width = pct + '%';
    }
    highlightStep(idx) {
        this.panel.querySelectorAll('.dash-step').forEach((el, i) => {
            el.classList.toggle('running', i === idx);
        });
    }
    // ── Rendering ────────────────────────────────────────────────────────
    render() {
        let s = this.current();
        let listHtml = this.scenarios.map(sc => {
            let cls = sc.id === this.currentId ? 'dash-scen active' : 'dash-scen';
            return `<li class="${cls}" data-id="${this.esc(sc.id)}">${this.esc(sc.name)} <span class="dash-scen-meta">${sc.steps.length} steps</span></li>`;
        }).join('');
        let stepsHtml = '';
        if (s) {
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
    editorHtml(s, stepsHtml) {
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
    stepHtml(s, st, i) {
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
    bind() {
        let panel = this.panel;
        panel.querySelectorAll('.dash-scen').forEach(li => {
            li.addEventListener('click', () => {
                this.currentId = li.dataset['id'] || null;
                if (this.currentId)
                    localStorage.setItem('rag.currentScenarioId', this.currentId);
                this.render();
            });
        });
        let btnSettings = panel.querySelector('#dashSettings');
        if (btnSettings)
            btnSettings.onclick = () => RAG.views.settings.open();
        let btnOpenDisplay = panel.querySelector('#dashOpenDisplay');
        if (btnOpenDisplay)
            btnOpenDisplay.onclick = () => window.open('screen.html', '_blank');
        let btnNew = panel.querySelector('#dashNew');
        if (btnNew)
            btnNew.onclick = () => {
                let id = 'scn_' + Date.now();
                this.scenarios.push({ id: id, name: 'Scenario ' + (this.scenarios.length + 1), steps: [], loopCount: 1, createdAt: Date.now(), updatedAt: Date.now() });
                this.currentId = id;
                localStorage.setItem('rag.currentScenarioId', id);
                this.saveAll();
                this.render();
            };
        let btnAdd = panel.querySelector('#dashAddStep');
        if (btnAdd)
            btnAdd.onclick = () => this.captureStep();
        let btnWait = panel.querySelector('#dashAddWait');
        if (btnWait)
            btnWait.onclick = () => {
                let s = this.current();
                if (!s)
                    return;
                s.steps.push({ type: 'wait', gapMs: 0, waitSeconds: 3 });
                s.updatedAt = Date.now();
                this.saveAll();
                this.render();
            };
        panel.querySelectorAll('.dash-up').forEach(b => {
            b.addEventListener('click', () => this.moveStep(b, -1));
        });
        panel.querySelectorAll('.dash-down').forEach(b => {
            b.addEventListener('click', () => this.moveStep(b, 1));
        });
        panel.querySelectorAll('.dash-del').forEach(b => {
            b.addEventListener('click', () => this.deleteStep(b));
        });
        panel.querySelectorAll('.dash-edit').forEach(b => {
            b.addEventListener('click', () => this.editStep(parseInt(b.dataset['idx'] || '0', 10)));
        });
        panel.querySelectorAll('.dash-stepplay').forEach(b => {
            b.addEventListener('click', () => {
                let idx = parseInt(b.dataset['idx'] || '0', 10);
                this.playStepOnly(idx);
            });
        });
        panel.querySelectorAll('.dash-gap').forEach(inp => {
            inp.addEventListener('change', () => {
                let idx = parseInt(inp.dataset['idx'] || '0', 10);
                let s = this.current();
                if (!s)
                    return;
                s.steps[idx].gapMs = parseInt(inp.value, 10) || 0;
                s.updatedAt = Date.now();
                this.saveAll();
            });
        });
        panel.querySelectorAll('.dash-wait').forEach(inp => {
            inp.addEventListener('change', () => {
                let idx = parseInt(inp.dataset['idx'] || '0', 10);
                let s = this.current();
                if (!s)
                    return;
                s.steps[idx].waitSeconds = parseInt(inp.value, 10) || 0;
                s.updatedAt = Date.now();
                this.saveAll();
                this.render();
            });
        });
        let nameInput = panel.querySelector('#dashName');
        if (nameInput) {
            let el = nameInput;
            el.addEventListener('change', () => {
                let s = this.current();
                if (!s)
                    return;
                s.name = el.value;
                s.updatedAt = Date.now();
                this.saveAll();
                this.render();
            });
        }
        let loopInput = panel.querySelector('#dashLoop');
        if (loopInput) {
            let el = loopInput;
            el.addEventListener('change', () => {
                let s = this.current();
                if (!s)
                    return;
                s.loopCount = parseInt(el.value, 10) || 1;
                s.updatedAt = Date.now();
                this.saveAll();
            });
        }
        let btnPlay = panel.querySelector('#dashPlay');
        if (btnPlay)
            btnPlay.onclick = () => this.startPlayback();
        let btnStop = panel.querySelector('#dashStop');
        if (btnStop)
            btnStop.onclick = () => this.stopPlayback();
        let btnExport = panel.querySelector('#dashExport');
        if (btnExport)
            btnExport.onclick = () => this.exportJson();
        let btnImport = panel.querySelector('#dashImport');
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
    captureStep() {
        let captured = false;
        let nonce = 'cap_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
        let handler = (msg) => {
            if (captured || !msg || msg.nonce !== nonce || !msg.stateJson)
                return;
            captured = true;
            if (RAG.channel)
                RAG.channel.off('CAPTURED_STEP_DATA', handler);
            this.pushStep(msg.stateJson);
        };
        if (RAG.channel) {
            RAG.channel.on('CAPTURED_STEP_DATA', handler);
            RAG.channel.send('CAPTURE_STEP_REQUEST', { nonce: nonce });
        }
        window.setTimeout(() => {
            if (RAG.channel)
                RAG.channel.off('CAPTURED_STEP_DATA', handler);
            if (!captured)
                this.pushStep(JSON.stringify(RAG.state));
        }, 1200);
    }
    pushStep(stateJson) {
        let s = this.current();
        if (!s) {
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
    editStep(idx) {
        let s = this.current();
        if (!s || !s.steps[idx])
            return;
        let step = s.steps[idx];
        if (step.type !== 'announcement' || !step.stateJson) {
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
    moveStep(btn, dir) {
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
    deleteStep(btn) {
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
    exportJson() {
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
    importJson() {
        let input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json, .json';
        input.onchange = () => __awaiter(this, void 0, void 0, function* () {
            let file = input.files && input.files[0];
            if (!file)
                return;
            let f = file;
            let text = yield new Promise(resolve => {
                let reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => resolve('');
                reader.readAsText(f);
            });
            if (text === '')
                return;
            try {
                let imported = JSON.parse(text);
                if (!Array.isArray(imported))
                    throw new Error('Expected an array of scenarios');
                imported.forEach(sc => {
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
            catch (e) {
                alert('Invalid JSON: expected an array of scenarios.');
            }
        });
        input.click();
    }
}
window.ScenarioDashboard = ScenarioDashboard;
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Language definitions for English; also acts as the base language */
class EnglishLanguage {
    constructor() {
        // RAG
        this.WELCOME = 'Welcome to Rail Announcement Generator.';
        this.DOM_MISSING = (q) => `Required DOM element is missing: '${q}'`;
        this.ATTR_MISSING = (a) => `Required attribute is missing: '${a}'`;
        this.DATA_MISSING = (k) => `Required dataset key is missing or empty: '${k}'`;
        this.BAD_DIRECTION = (v) => `Direction needs to be -1 or 1, not '${v}'`;
        this.BAD_BOOLEAN = (v) => `Given string does not represent a boolean: '${v}'`;
        // State
        this.STATE_FROM_STORAGE = 'State has been loaded from storage.';
        this.STATE_BAD_PHRASESET = (r) => `Attempted to get chosen index for phraseset (${r}) that doesn't exist.`;
        // Config
        this.CONFIG_LOAD_FAIL = (msg) => `Could not load settings: ${msg}`;
        this.CONFIG_SAVE_FAIL = (msg) => `Could not save settings: ${msg}`;
        this.CONFIG_RESET_FAIL = (msg) => `Could not clear settings: ${msg}`;
        // Database
        this.DB_ELEMENT_NOT_PHRASESET_IFRAME = (e) => `Configured phraseset element query '${e}' does not point to an iframe embed.`;
        this.DB_UNKNOWN_STATION = (c) => `UNKNOWN STATION: ${c}`;
        this.DB_EMPTY_STATION = (c) => `Station database appears to contain an empty name for code '${c}'.`;
        this.DB_TOO_MANY_STATIONS = () => 'Picking too many stations than there are available';
        // Toolbar
        this.TOOLBAR_PLAY = 'Play phrase';
        this.TOOLBAR_STOP = 'Stop playing phrase';
        this.TOOLBAR_SHUFFLE = 'Generate random phrase';
        this.TOOLBAR_SETTINGS = 'Open settings';
        this.TOOLBAR_CLOSE = 'Close the editor and return to the scenario dashboard';
        // Editor
        this.TITLE_COACH = (c) => `Click to change this coach ('${c}')`;
        this.TITLE_EXCUSE = 'Click to change this excuse';
        this.TITLE_INTEGER = (c) => `Click to change this number ('${c}')`;
        this.TITLE_NAMED = 'Click to change this train\'s name';
        this.TITLE_OPT_OPEN = (t, r) => `Click to open this optional ${t} ('${r}')`;
        this.TITLE_OPT_CLOSE = (t, r) => `Click to close this optional ${t} ('${r}')`;
        this.TITLE_PHRASESET = (r) => `Click to change the phrase used in this section ('${r}')`;
        this.TITLE_PLATFORM = 'Click to change this train\'s platform';
        this.TITLE_SERVICE = (c) => `Click to change this service ('${c}')`;
        this.TITLE_STATION = (c) => `Click to change this station ('${c}')`;
        this.TITLE_STATIONLIST = (c) => `Click to change this station list ('${c}')`;
        this.TITLE_TIME = (c) => `Click to change this time ('${c}')`;
        this.EDITOR_INIT = 'Please wait...';
        this.EDITOR_UNKNOWN_ELEMENT = (n) => `(UNKNOWN XML ELEMENT: ${n})`;
        this.EDITOR_UNKNOWN_PHRASE = (r) => `(UNKNOWN PHRASE: ${r})`;
        this.EDITOR_UNKNOWN_PHRASESET = (r) => `(UNKNOWN PHRASESET: ${r})`;
        // Phraser
        this.PHRASER_TOO_RECURSIVE = 'Too many levels of recursion whilst processing phrase.';
        // Pickers
        this.HEADER_COACH = (c) => `Pick a coach letter for the '${c}' context`;
        this.HEADER_EXCUSE = 'Pick an excuse';
        this.HEADER_INTEGER = (c) => `Pick a number for the '${c}' context`;
        this.HEADER_NAMED = 'Pick a named train';
        this.HEADER_PHRASESET = (r) => `Pick a phrase for the '${r}' section`;
        this.HEADER_PLATFORM = 'Pick a platform';
        this.HEADER_SERVICE = (c) => `Pick a service for the '${c}' context`;
        this.HEADER_STATION = (c) => `Pick a station for the '${c}' context`;
        this.HEADER_STATIONLIST = (c) => `Build a station list for the '${c}' context`;
        this.HEADER_TIME = (c) => `Pick a time for the '${c}' context`;
        this.P_GENERIC_T = 'List of choices';
        this.P_GENERIC_PH = 'Filter choices...';
        this.P_COACH_T = 'Coach letter';
        this.P_EXCUSE_T = 'List of delay or cancellation excuses';
        this.P_EXCUSE_PH = 'Filter excuses...';
        this.P_EXCUSE_ITEM_T = 'Click to select this excuse';
        this.P_INT_T = 'Integer value';
        this.P_NAMED_T = 'List of train names';
        this.P_NAMED_PH = 'Filter train name...';
        this.P_NAMED_ITEM_T = 'Click to select this name';
        this.P_PSET_T = 'List of phrases';
        this.P_PSET_PH = 'Filter phrases...';
        this.P_PSET_ITEM_T = 'Click to select this phrase';
        this.P_PLAT_NUMBER_T = 'Platform number';
        this.P_PLAT_LETTER_T = 'Optional platform letter';
        this.P_SERV_T = 'List of service names';
        this.P_SERV_PH = 'Filter services...';
        this.P_SERV_ITEM_T = 'Click to select this service';
        this.P_STATION_T = 'List of station names';
        this.P_STATION_PH = 'Filter stations...';
        this.P_STATION_ITEM_T = 'Click to select or add this station';
        this.P_SL_ADD = 'Add station...';
        this.P_SL_ADD_T = 'Add station to this list';
        this.P_SL_CLOSE = 'Close';
        this.P_SL_CLOSE_T = 'Close this picker';
        this.P_SL_EMPTY = 'Please add at least one station to this list';
        this.P_SL_DRAG_T = 'Draggable selection of stations for this list';
        this.P_SL_DELETE = 'Drop here to delete';
        this.P_SL_DELETE_T = 'Drop station here to delete it from this list';
        this.P_SL_ITEM_T = 'Drag to reorder; double-click or drag into delete zone to remove';
        this.P_TIME_T = 'Time editor';
        // Settings
        this.ST_RESET = 'Reset to defaults';
        this.ST_RESET_T = 'Reset settings to defaults';
        this.ST_RESET_CONFIRM = 'Are you sure?';
        this.ST_RESET_CONFIRM_T = 'Confirm reset to defaults';
        this.ST_RESET_DONE = 'Settings have been reset to their defaults, and deleted from' +
            ' storage.';
        this.ST_SAVE = 'Save & close';
        this.ST_SAVE_T = 'Save and close settings';
        this.ST_SPEECH = 'Speech';
        this.ST_SPEECH_CHOICE = 'Voice';
        this.ST_SPEECH_EMPTY = 'None available';
        this.ST_SPEECH_VOL = 'Volume';
        this.ST_SPEECH_PITCH = 'Pitch';
        this.ST_SPEECH_RATE = 'Rate';
        this.ST_SPEECH_TEST = 'Test speech';
        this.ST_SPEECH_TEST_T = 'Play a speech sample with the current settings';
        this.ST_LEGAL = 'Legal & Acknowledgements';
        this.WARN_SHORT_HEADER = '"May I have your attention please..."';
        this.WARN_SHORT = 'This display is too short to support RAG. Please make this' +
            ' window taller, or rotate your device from landscape to portrait.';
        // TODO: These don't fit here; this should go in the data
        this.LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        this.DIGITS = [
            'zero', 'one', 'two', 'three', 'four', 'five', 'six',
            'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
            'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'ninteen', 'twenty'
        ];
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/**
 * Holds methods for processing each type of phrase element into HTML, with data taken
 * from the current state. Each method takes a context object, holding data for the
 * current XML element being processed and the XML document being used.
 */
class ElementProcessors {
    /** Fills in coach letters from A to Z */
    static coach(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        ctx.newElement.title = L.TITLE_COACH(context);
        ctx.newElement.textContent = RAG.state.getCoach(context);
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in the excuse, for a delay or cancellation */
    static excuse(ctx) {
        ctx.newElement.title = L.TITLE_EXCUSE;
        ctx.newElement.textContent = RAG.state.excuse;
        ctx.newElement.tabIndex = 1;
    }
    /** Fills in integers, optionally with nouns and in word form */
    static integer(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let singular = ctx.xmlElement.getAttribute('singular');
        let plural = ctx.xmlElement.getAttribute('plural');
        let words = ctx.xmlElement.getAttribute('words');
        let int = RAG.state.getInteger(context);
        let intStr = (words && words.toLowerCase() === 'true')
            ? L.DIGITS[int] || int.toString()
            : int.toString();
        if (int === 1 && singular)
            intStr += ` ${singular}`;
        else if (int !== 1 && plural)
            intStr += ` ${plural}`;
        ctx.newElement.title = L.TITLE_INTEGER(context);
        ctx.newElement.textContent = intStr;
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
        if (singular)
            ctx.newElement.dataset['singular'] = singular;
        if (plural)
            ctx.newElement.dataset['plural'] = plural;
        if (words)
            ctx.newElement.dataset['words'] = words;
    }
    /** Fills in the named train */
    static named(ctx) {
        ctx.newElement.title = L.TITLE_NAMED;
        ctx.newElement.textContent = RAG.state.named;
        ctx.newElement.tabIndex = 1;
    }
    /** Includes a previously defined phrase, by its `id` */
    static phrase(ctx) {
        let ref = DOM.requireAttr(ctx.xmlElement, 'ref');
        let phrase = RAG.database.getPhrase(ref);
        ctx.newElement.title = '';
        ctx.newElement.dataset['ref'] = ref;
        if (!phrase) {
            ctx.newElement.textContent = L.EDITOR_UNKNOWN_PHRASE(ref);
            return;
        }
        // Handle phrases with a chance value as collapsible
        ElementProcessors.makeCollapsible(ctx, ref);
        ctx.newElement.appendChild(ElementProcessors.wrapToInner(phrase));
    }
    /** Includes a phrase from a previously defined phraseset, by its `id` */
    static phraseset(ctx) {
        let ref = DOM.requireAttr(ctx.xmlElement, 'ref');
        let phraseset = RAG.database.getPhraseset(ref);
        let forcedIdx = ctx.xmlElement.getAttribute('idx');
        ctx.newElement.dataset['ref'] = ref;
        if (!phraseset) {
            ctx.newElement.textContent = L.EDITOR_UNKNOWN_PHRASESET(ref);
            return;
        }
        let idx = forcedIdx
            ? parseInt(forcedIdx)
            : RAG.state.getPhrasesetIdx(ref);
        let phrase = phraseset.children[idx];
        ctx.newElement.dataset['idx'] = forcedIdx || idx.toString();
        // Handle phrasesets with a chance value as collapsible
        ElementProcessors.makeCollapsible(ctx, ref);
        ctx.newElement.appendChild(ElementProcessors.wrapToInner(phrase));
    }
    /** Fills in the current platform */
    static platform(ctx) {
        ctx.newElement.title = L.TITLE_PLATFORM;
        ctx.newElement.textContent = (RAG.state.platform[1] === 'M')
            ? RAG.state.platform[0] + '¾'
            : RAG.state.platform.join('');
        ctx.newElement.tabIndex = 1;
    }
    /** Fills in the rail network name */
    static service(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        ctx.newElement.title = L.TITLE_SERVICE(context);
        ctx.newElement.textContent = RAG.state.getService(context);
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in station names */
    static station(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let code = RAG.state.getStation(context);
        ctx.newElement.title = L.TITLE_STATION(context);
        ctx.newElement.textContent = RAG.database.getStation(code);
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in station lists */
    static stationlist(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let stations = RAG.state.getStationList(context).slice();
        let stationList = Strings.fromStationList(stations, context);
        ctx.newElement.title = L.TITLE_STATIONLIST(context);
        ctx.newElement.textContent = stationList;
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in the time */
    static time(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        ctx.newElement.title = L.TITLE_TIME(context);
        ctx.newElement.textContent = RAG.state.getTime(context);
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in vox parts */
    static vox(ctx) {
        let key = DOM.requireAttr(ctx.xmlElement, 'key');
        // TODO: Localize
        ctx.newElement.textContent = ctx.xmlElement.textContent;
        ctx.newElement.title = `Click to edit this phrase (${key})`;
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['key'] = key;
    }
    /** Handles unknown elements with an inline error message */
    static unknown(ctx) {
        let name = ctx.xmlElement.nodeName;
        ctx.newElement.textContent = L.EDITOR_UNKNOWN_ELEMENT(name);
    }
    /**
     * Attaches chance and a pre-determined collapse state for a given phrase element, if
     * it does have a chance attribue.
     *
     * @param ctx Context of the current phrase element being processed
     * @param ref Reference ID to get (or pick) the collapse state of
     */
    static makeCollapsible(ctx, ref) {
        if (!ctx.xmlElement.hasAttribute('chance'))
            return;
        let chance = ctx.xmlElement.getAttribute('chance');
        let collapsed = RAG.state.getCollapsed(ref, parseInt(chance));
        ctx.newElement.dataset['chance'] = chance;
        Collapsibles.set(ctx.newElement, collapsed);
    }
    /**
     * Clones the children of the given element into a new inner span tag, so that they
     * can be made collapsible or bundled with buttons.
     *
     * @param source Parent to clone the children of, into a wrapper
     */
    static wrapToInner(source) {
        let inner = document.createElement('span');
        inner.classList.add('inner');
        DOM.cloneInto(source, inner);
        return inner;
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/**
 * Handles the transformation of phrase XML data, into HTML elements with their data
 * filled in and their UI logic wired.
 */
class Phraser {
    /**
     * Recursively processes XML elements, filling in data and applying transforms.
     *
     * @param container Parent to process the children of
     * @param level Current level of recursion, max. 20
     */
    process(container, level = 0) {
        // Initially, this method was supposed to just add the XML elements directly into
        // the document. However, this caused a lot of problems (e.g. title not working).
        // HTML does not work really well with custom elements, especially if they are of
        // another XML namespace.
        let query = ':not(span):not(svg):not(use):not(button)';
        let pending = container.querySelectorAll(query);
        // No more XML elements to expand
        if (pending.length === 0)
            return;
        // For each XML element currently in the container:
        // * Create a new span element for it
        // * Have the processors take data from the XML element, to populate the new one
        // * Replace the XML element with the new one
        pending.forEach(element => {
            let elementName = element.nodeName.toLowerCase();
            let newElement = document.createElement('span');
            let context = {
                xmlElement: element,
                newElement: newElement
            };
            newElement.dataset['type'] = elementName;
            // I wanted to use an index on ElementProcessors for this, but it caused every
            // processor to have an "unused method" warning.
            switch (elementName) {
                case 'coach':
                    ElementProcessors.coach(context);
                    break;
                case 'excuse':
                    ElementProcessors.excuse(context);
                    break;
                case 'integer':
                    ElementProcessors.integer(context);
                    break;
                case 'named':
                    ElementProcessors.named(context);
                    break;
                case 'phrase':
                    ElementProcessors.phrase(context);
                    break;
                case 'phraseset':
                    ElementProcessors.phraseset(context);
                    break;
                case 'platform':
                    ElementProcessors.platform(context);
                    break;
                case 'service':
                    ElementProcessors.service(context);
                    break;
                case 'station':
                    ElementProcessors.station(context);
                    break;
                case 'stationlist':
                    ElementProcessors.stationlist(context);
                    break;
                case 'time':
                    ElementProcessors.time(context);
                    break;
                case 'vox':
                    ElementProcessors.vox(context);
                    break;
                default:
                    ElementProcessors.unknown(context);
                    break;
            }
            element.parentElement.replaceChild(newElement, element);
        });
        // Recurse so that we can expand any new elements
        if (level < 20)
            this.process(container, level + 1);
        else
            throw Error(L.PHRASER_TOO_RECURSIVE);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
class Scenario {
    constructor() {
        this.steps = [];
        this.currentIndex = 0;
        this.running = false;
        this.paused = false;
        this.timer = 0;
        this.waitInterval = 0;
        /** When true, the scenario stops right after the current step (single-step play) */
        this.stopAfterStep = false;
        /** Safety timer: advances the step even if the speech engine never signals completion */
        this.watchdog = 0;
        /** Guard so a step completes (speech end or watchdog) and advances exactly once */
        this.stepFinished = false;
        this.loopCount = 1;
        this.loopsDone = 0;
    }
    setSteps(steps) {
        this.steps = steps;
        this.currentIndex = 0;
    }
    addStep(stateJson, gapMs = 1500) {
        this.steps.push({ type: 'announcement', stateJson, gapMs });
    }
    setLoopCount(n) {
        this.loopCount = Math.max(1, n);
    }
    get stepCount() { return this.steps.length; }
    get isRunning() { return this.running; }
    get isPaused() { return this.paused; }
    exportJson() { }
    get currentLoopValue() { return this.loopsDone + 1; }
    get totalLoopsValue() { return this.loopCount; }
    clear() {
        this.stop();
        this.steps = [];
        this.currentIndex = 0;
    }
    play() {
        if (this.steps.length === 0)
            return;
        if (this.paused) {
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
    playStep(idx) {
        if (idx < 0 || idx >= this.steps.length)
            return;
        this.stop();
        this.running = true;
        this.paused = false;
        this.currentIndex = idx;
        this.loopsDone = 0;
        this.loopCount = 1;
        this.stopAfterStep = true;
        this.runStep();
    }
    pause() {
        if (!this.running)
            return;
        this.running = false;
        this.paused = true;
        // Stop speech first: it may re-fire onstop, which could schedule a
        // pending advance; clear all timers afterwards so nothing survives.
        if (typeof RAG !== 'undefined' && RAG.speech)
            RAG.speech.stop();
        clearTimeout(this.timer);
        clearTimeout(this.watchdog);
        clearInterval(this.waitInterval);
        this.broadcast('STOP_PLAYBACK');
    }
    stop() {
        this.running = false;
        this.paused = false;
        // Stop speech first (see pause) so a re-fired onstop can't leave a
        // pending advance timer behind this clear.
        if (typeof RAG !== 'undefined' && RAG.speech)
            RAG.speech.stop();
        clearTimeout(this.timer);
        clearTimeout(this.watchdog);
        clearInterval(this.waitInterval);
        this.stepFinished = false;
        this.stopAfterStep = false;
        this.broadcast('STOP_PLAYBACK');
    }
    runStep() {
        if (!this.running)
            return;
        if (this.currentIndex >= this.steps.length) {
            this.loopsDone++;
            if (this.loopsDone < this.loopCount) {
                this.currentIndex = 0;
                this.runStep();
                return;
            }
            this.running = false;
            this.paused = false;
            this.broadcast('STOP_PLAYBACK');
            if (this.onComplete)
                this.onComplete();
            return;
        }
        let step = this.steps[this.currentIndex];
        if (this.onStep)
            this.onStep(this.currentIndex, this.steps.length, step);
        if (step.type === 'wait') {
            let total = step.waitSeconds || 0;
            let remaining = total;
            let waitText = `Waiting ${remaining}s...`;
            if (this.onTextUpdate)
                this.onTextUpdate(waitText);
            if (this.onWaitCountdown)
                this.onWaitCountdown(remaining, total);
            if (typeof RAG !== 'undefined' && RAG.views && RAG.views.marquee)
                RAG.views.marquee.set(waitText);
            this.broadcast('WAIT_COUNTDOWN', { remainingSeconds: remaining, totalSeconds: total });
            this.waitInterval = window.setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(this.waitInterval);
                    return;
                }
                let txt = `Waiting ${remaining}s...`;
                if (this.onTextUpdate)
                    this.onTextUpdate(txt);
                if (this.onWaitCountdown)
                    this.onWaitCountdown(remaining, total);
                if (typeof RAG !== 'undefined' && RAG.views && RAG.views.marquee)
                    RAG.views.marquee.set(txt);
                this.broadcast('WAIT_COUNTDOWN', { remainingSeconds: remaining, totalSeconds: total });
            }, 1000);
            this.timer = window.setTimeout(() => {
                clearInterval(this.waitInterval);
                this.advance();
            }, total * 1000);
            return;
        }
        // Announcement step
        try {
            if (step.stateJson && typeof RAG !== 'undefined' && RAG.load) {
                RAG.load(step.stateJson);
            }
        }
        catch (e) {
            if (this.onError)
                this.onError('Failed to load step state: ' + e);
            this.stop();
            return;
        }
        let text = (typeof RAG !== 'undefined' && RAG.views && RAG.views.editor) ? RAG.views.editor.getText() : 'Playing step...';
        if (this.onTextUpdate)
            this.onTextUpdate(text);
        if (typeof RAG !== 'undefined' && RAG.views && RAG.views.marquee)
            RAG.views.marquee.set(text);
        this.broadcast('PLAY_SCENARIO_STEP', { index: this.currentIndex, text: text });
        let phraseEl = (typeof RAG !== 'undefined' && RAG.views && RAG.views.editor) ? RAG.views.editor.getPhrase() : null;
        if (phraseEl && typeof RAG !== 'undefined' && RAG.speech) {
            // Reset the per-step guard, then arm both the normal path (speech
            // signals completion) and a watchdog in case the engine never does.
            this.stepFinished = false;
            RAG.speech.onspeak = () => {
                let currentText = RAG.views.editor.getText();
                if (this.onTextUpdate)
                    this.onTextUpdate(currentText);
                RAG.views.marquee.set(currentText);
                RAG.speech.onspeak = undefined;
            };
            RAG.speech.onstop = () => {
                this.finishStep(step.gapMs);
            };
            // Watchdog: a backstop for a speech engine that never signals
            // completion. VOX announcements run longer than the text-length
            // estimate (clips plus pauses), so when the watchdog fires the
            // engine may still be playing real audio: extend a few times in
            // that case instead of cutting the announcement short. The bounded
            // re-arms keep a hung engine from stalling the scenario forever.
            let rearmLeft = 3;
            let armWatchdog = (ms) => {
                clearTimeout(this.watchdog);
                this.watchdog = window.setTimeout(() => {
                    let speaking = (typeof RAG !== 'undefined' && RAG.speech) ? RAG.speech.isSpeaking : false;
                    if (speaking && rearmLeft > 0) {
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
        else {
            this.stepFinished = false;
            this.timer = window.setTimeout(() => {
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
    finishStep(gapMs) {
        if (this.stepFinished)
            return;
        this.stepFinished = true;
        clearTimeout(this.watchdog);
        if (typeof RAG !== 'undefined' && RAG.speech)
            RAG.speech.stop();
        this.timer = window.setTimeout(() => {
            this.advance();
        }, gapMs || 0);
    }
    advance() {
        if (!this.running)
            return;
        // "Play one step" mode: this step was the only one asked for, so
        // finish the run here.
        if (this.stopAfterStep) {
            this.stopAfterStep = false;
            this.running = false;
            this.paused = false;
            this.broadcast('STOP_PLAYBACK');
            if (this.onComplete)
                this.onComplete();
            return;
        }
        this.currentIndex++;
        this.runStep();
    }
    /** Broadcast a playback event to the other tabs (the editor mirrors it, display-only) */
    broadcast(type, payload) {
        if (typeof RAG !== 'undefined' && RAG.channel)
            RAG.channel.send(type, payload || {});
    }
}
window.Scenario = Scenario;
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Utility class for resolving a given phrase to vox keys */
class Resolver {
    /** TreeWalker filter to reduce a walk to just the elements the resolver needs */
    static nodeFilter(node) {
        let parent = node.parentElement;
        let parentType = parent.dataset['type'];
        // If type is missing, parent is a wrapper
        if (!parentType) {
            parent = parent.parentElement;
            parentType = parent.dataset['type'];
        }
        // Accept text only from phrase and phrasesets
        if (node.nodeType === Node.TEXT_NODE)
            if (parentType !== 'phraseset' && parentType !== 'phrase')
                return NodeFilter.FILTER_SKIP;
        if (node.nodeType === Node.ELEMENT_NODE) {
            let element = node;
            let type = element.dataset['type'];
            // Reject collapsed elements and their children
            if (element.hasAttribute('collapsed'))
                return NodeFilter.FILTER_REJECT;
            // Skip typeless (wrapper) elements
            if (!type)
                return NodeFilter.FILTER_SKIP;
            // Skip over phrase and phrasesets (instead, only going for their children)
            if (type === 'phraseset' || type === 'phrase')
                return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
    }
    constructor(phrase) {
        this.phrase = phrase;
        this.flattened = [];
        this.resolved = [];
    }
    toVox() {
        // First, walk through the phrase and "flatten" it into an array of parts. This is
        // so the resolver can look-ahead or look-behind.
        this.flattened = [];
        this.resolved = [];
        let treeWalker = document.createTreeWalker(this.phrase, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: Resolver.nodeFilter }, false);
        while (treeWalker.nextNode())
            if (treeWalker.currentNode.textContent.trim() !== '')
                this.flattened.push(treeWalker.currentNode);
        // Then, resolve all the phrases' nodes into vox keys
        this.flattened.forEach((v, i) => this.resolved.push(...this.resolve(v, i)));
        console.log(this.flattened, this.resolved);
        return this.resolved;
    }
    /**
     * Uses the type and value of the given node, to resolve it to vox file IDs.
     *
     * @param node Node to resolve to vox IDs
     * @param idx Index of the node being resolved relative to the phrase array
     * @returns Array of IDs that make up one or more file IDs. Can be empty.
     */
    resolve(node, idx) {
        if (node.nodeType === Node.TEXT_NODE)
            return this.resolveText(node);
        let element = node;
        let type = element.dataset['type'];
        switch (type) {
            case 'coach': return this.resolveCoach(element, idx);
            case 'excuse': return this.resolveExcuse(idx);
            case 'integer': return this.resolveInteger(element);
            case 'named': return this.resolveNamed();
            case 'platform': return this.resolvePlatform(idx);
            case 'service': return this.resolveService(element);
            case 'station': return this.resolveStation(element, idx);
            case 'stationlist': return this.resolveStationList(element, idx);
            case 'time': return this.resolveTime(element);
            case 'vox': return this.resolveVox(element);
        }
        return [];
    }
    getInflection(idx) {
        let next = this.flattened[idx + 1];
        return (next && next.textContent.trim().startsWith('.'))
            ? 'end'
            : 'mid';
    }
    resolveText(node) {
        let parent = node.parentElement;
        let type = parent.dataset['type'];
        let text = Strings.clean(node.textContent);
        let set = [];
        // If text is just a full stop, return silence
        if (text === '.')
            return [0.65];
        // If it begins with a full stop, add silence
        if (text.startsWith('.'))
            set.push(0.65);
        // If the text doesn't contain any words, skip
        if (!text.match(/[a-z0-9]/i))
            return set;
        // If type is missing, parent is a wrapper
        if (!type) {
            parent = parent.parentElement;
            type = parent.dataset['type'];
        }
        let ref = parent.dataset['ref'];
        let idx = DOM.nodeIndexOf(node);
        let id = `${type}.${ref}`;
        // Append index of phraseset's choice of phrase
        if (type === 'phraseset')
            id += `.${parent.dataset['idx']}`;
        id += `.${idx}`;
        set.push(id);
        // If text ends with a full stop, add silence
        if (text.endsWith('.'))
            set.push(0.65);
        return set;
    }
    resolveCoach(element, idx) {
        let ctx = element.dataset['context'];
        let coach = RAG.state.getCoach(ctx);
        let inflect = this.getInflection(idx);
        let result = [0.2, `letter.${coach}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveExcuse(idx) {
        let excuse = RAG.state.excuse;
        let key = Strings.filename(excuse);
        let inflect = this.getInflection(idx);
        let result = [0.15, `excuse.${key}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveInteger(element) {
        let ctx = element.dataset['context'];
        let singular = element.dataset['singular'];
        let plural = element.dataset['plural'];
        let integer = RAG.state.getInteger(ctx);
        let parts = [0.125, `number.${integer}.mid`];
        if (singular && integer === 1)
            parts.push(0.15, `number.suffix.${singular}.end`);
        else if (plural && integer !== 1)
            parts.push(0.15, `number.suffix.${plural}.end`);
        else
            parts.push(0.15);
        return parts;
    }
    resolveNamed() {
        let named = Strings.filename(RAG.state.named);
        return [0.2, `named.${named}.mid`, 0.2];
    }
    resolvePlatform(idx) {
        let platform = RAG.state.platform;
        let inflect = this.getInflection(idx);
        let letter = (platform[1] === '¾') ? 'M' : platform[1];
        let result = [0.15, `number.${platform[0]}${letter}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveService(element) {
        let ctx = element.dataset['context'];
        let service = Strings.filename(RAG.state.getService(ctx));
        let result = [];
        // Only add beginning delay if there isn't already one prior
        if (typeof this.resolved.slice(-1)[0] !== 'number')
            result.push(0.15);
        return [...result, `service.${service}.mid`, 0.15];
    }
    resolveStation(element, idx) {
        let ctx = element.dataset['context'];
        let station = RAG.state.getStation(ctx);
        let voxKey = RAG.database.getStationVox(station);
        let inflect = this.getInflection(idx);
        let result = [0.2, `station.${voxKey}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveStationList(element, idx) {
        let ctx = element.dataset['context'];
        let list = RAG.state.getStationList(ctx);
        let inflect = this.getInflection(idx);
        let parts = [0.2];
        list.forEach((code, k) => {
            let voxKey = RAG.database.getStationVox(code);
            // Handle middle of list inflection
            if (k !== list.length - 1) {
                parts.push(`station.${voxKey}.mid`, 0.25);
                return;
            }
            // Add "and" if list has more than 1 station and this is the end
            if (list.length > 1)
                parts.push('station.parts.and.mid', 0.25);
            // Add "only" if only one station in the calling list
            if (list.length === 1 && ctx === 'calling') {
                parts.push(`station.${voxKey}.mid`);
                parts.push(0.2, 'station.parts.only.end');
            }
            else
                parts.push(`station.${voxKey}.${inflect}`);
        });
        return [...parts, 0.2];
    }
    resolveTime(element) {
        let ctx = element.dataset['context'];
        let time = RAG.state.getTime(ctx).split(':');
        let parts = [0.2];
        if (time[0] === '00' && time[1] === '00')
            return [...parts, 'number.0000.mid', 0.2];
        // Hours
        parts.push(`number.${time[0]}.begin`);
        if (time[1] === '00')
            parts.push(0.075, 'number.hundred.mid');
        else
            parts.push(0.2, `number.${time[1]}.mid`);
        return [...parts, 0.15];
    }
    resolveVox(element) {
        let text = element.innerText.trim();
        let result = [];
        if (text.startsWith('.'))
            result.push(0.65);
        result.push(element.dataset['key']);
        if (text.endsWith('.'))
            result.push(0.65);
        return result;
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Manages speech synthesis using both native and custom engines */
class Speech {
    constructor() {
        /** Dictionary of browser-provided voices available */
        this.browserVoices = {};
        /** Reference to the native speech-stopped check timer */
        this.stopTimer = 0;
        // Some browsers don't properly cancel speech on page close.
        // BUG: onpageshow and onpagehide not working on iOS 11
        window.onbeforeunload =
            window.onunload =
                window.onpageshow =
                    window.onpagehide = this.stop.bind(this);
        document.onvisibilitychange = this.onVisibilityChange.bind(this);
        window.speechSynthesis.onvoiceschanged = this.onVoicesChanged.bind(this);
        // Even though 'onvoiceschanged' is used later to populate the list, Chrome does
        // not actually fire the event until this call...
        this.onVoicesChanged();
        // For some reason, Chrome needs this called once for native speech to work
        window.speechSynthesis.cancel();
        try {
            this.voxEngine = new VoxEngine();
        }
        catch (err) {
            console.error('Could not create VOX engine:', err);
        }
    }
    /** Whether any speech engine is currently speaking */
    get isSpeaking() {
        if (this.voxEngine && this.voxEngine.isSpeaking)
            return true;
        else
            return window.speechSynthesis.speaking;
    }
    /** Whether the VOX engine is currently available */
    get voxAvailable() {
        return this.voxEngine !== undefined;
    }
    /** Begins speaking the given phrase components */
    speak(phrase, settings = {}) {
        this.stop();
        // VOX engine
        if (this.voxEngine && either(settings.useVox, RAG.config.voxEnabled))
            this.speakVox(phrase, settings);
        // Native browser text-to-speech
        else if (window.speechSynthesis)
            this.speakBrowser(phrase, settings);
        // No speech available; call stop event handler
        else if (this.onstop)
            this.onstop();
    }
    /** Stops and cancels all queued speech */
    stop() {
        if (!this.isSpeaking)
            return;
        if (window.speechSynthesis)
            window.speechSynthesis.cancel();
        if (this.voxEngine)
            this.voxEngine.stop();
        if (this.onstop)
            this.onstop();
    }
    /** Pause and unpause speech if the page is hidden or unhidden */
    onVisibilityChange() {
        // TODO: This needs to pause VOX engine
        let hiding = (document.visibilityState === 'hidden');
        if (hiding)
            window.speechSynthesis.pause();
        else
            window.speechSynthesis.resume();
    }
    /** Handles async voice list loading on some browsers, and sets default */
    onVoicesChanged() {
        this.browserVoices = {};
        window.speechSynthesis.getVoices().forEach(v => this.browserVoices[v.name] = v);
    }
    /**
     * Converts the given phrase to text and speaks it via native browser voices.
     *
     * @param phrase Phrase elements to speak
     * @param settings Settings to use for the voice
     */
    speakBrowser(phrase, settings) {
        let voiceName = either(settings.voiceName, RAG.config.speechVoice);
        let voice = this.browserVoices[voiceName];
        // Reset to first voice, if configured choice is missing
        if (!voice) {
            let first = Object.keys(this.browserVoices)[0];
            voice = this.browserVoices[first];
        }
        // The phrase text is split into sentences, as queueing large sentences that last
        // many seconds can break some TTS engines and browsers.
        let text = DOM.getCleanedVisibleText(phrase);
        let parts = text.split(/\.\s/i);
        parts.forEach((segment, idx) => {
            // Add missing full stop to each sentence except the last, which has it
            if (idx < parts.length - 1)
                segment += '.';
            let utterance = new SpeechSynthesisUtterance(segment);
            utterance.voice = voice;
            utterance.volume = either(settings.volume, RAG.config.speechVol);
            utterance.pitch = either(settings.pitch, RAG.config.speechPitch);
            utterance.rate = either(settings.rate, RAG.config.speechRate);
            window.speechSynthesis.speak(utterance);
        });
        // Fire immediately. I don't trust speech events to be reliable; see below.
        if (this.onspeak)
            this.onspeak();
        // This checks for when the native engine has stopped speaking, and calls the
        // onstop event handler. I could use SpeechSynthesis.onend instead, but it was
        // found to be unreliable, so I have to poll the speaking property this way.
        clearInterval(this.stopTimer);
        this.stopTimer = setInterval(() => {
            if (window.speechSynthesis.speaking)
                return;
            clearInterval(this.stopTimer);
            if (this.onstop)
                this.onstop();
        }, 100);
    }
    /**
     * Synthesizes voice by walking through the given phrase elements, resolving parts to
     * sound file IDs, and feeding the entire array to the vox engine.
     *
     * @param phrase Phrase elements to speak
     * @param settings Settings to use for the voice
     */
    speakVox(phrase, settings) {
        let resolver = new Resolver(phrase);
        let voxPath = RAG.config.voxPath || RAG.config.voxCustomPath;
        this.voxEngine.onspeak = () => {
            if (this.onspeak)
                this.onspeak();
        };
        this.voxEngine.onstop = () => {
            this.voxEngine.onspeak = undefined;
            this.voxEngine.onstop = undefined;
            if (this.onstop)
                this.onstop();
        };
        // Apply settings from config here, to keep VOX engine decoupled from RAG
        settings.voxPath = either(settings.voxPath, voxPath);
        settings.voxReverb = either(settings.voxReverb, RAG.config.voxReverb);
        settings.voxChime = either(settings.voxChime, RAG.config.voxChime);
        settings.volume = either(settings.volume, RAG.config.speechVol);
        settings.rate = either(settings.rate, RAG.config.speechRate);
        this.voxEngine.speak(resolver.toVox(), settings);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Synthesizes speech by dynamically loading and piecing together voice files */
class VoxEngine {
    constructor(dataPath = 'data/vox') {
        // Setup the core audio context
        /**
         * Cache of impulse responses reverb nodes, for reverb. This used to be a dictionary
         * of AudioBuffers, but ConvolverNodes cannot have their buffers changed.
         */
        this.impulses = {};
        /** Whether this engine is currently running and speaking */
        this.isSpeaking = false;
        /** Whether this engine has begun speaking for a current speech */
        this.begunSpeaking = false;
        /** Reference number for the current pump timer */
        this.pumpTimer = 0;
        /** Tracks the audio context's wall-clock time to schedule next clip */
        this.nextBegin = 0;
        /** References to currently pending requests, as a FIFO queue */
        this.pendingReqs = [];
        /** References to currently scheduled audio buffers */
        this.scheduledBuffers = [];
        // @ts-ignore - Defining these in Window interface does not work
        let audioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new audioContext();
        if (!this.audioContext)
            throw new Error('Could not get audio context');
        // Setup nodes
        this.dataPath = dataPath;
        this.gainNode = this.audioContext.createGain();
        this.filterNode = this.audioContext.createBiquadFilter();
        this.filterNode.type = 'highpass';
        this.filterNode.Q.value = 0.4;
        this.gainNode.connect(this.filterNode);
        // Rest of nodes get connected when speak is called
    }
    /**
     * Begins loading and speaking a set of vox files. Stops any speech.
     *
     * @param ids List of vox ids to load as files, in speaking order
     * @param settings Voice settings to use
     */
    speak(ids, settings) {
        console.debug('VOX SPEAK:', ids, settings);
        // Set state
        if (this.isSpeaking)
            this.stop();
        this.isSpeaking = true;
        this.begunSpeaking = false;
        this.currentIds = ids;
        this.currentSettings = settings;
        // Set reverb
        if (Strings.isNullOrEmpty(settings.voxReverb))
            this.setReverb();
        else {
            let file = settings.voxReverb;
            let reverb = this.impulses[file];
            if (!reverb) {
                // Make sure reverb is off first, else clips will queue in the audio
                // buffer and all suddenly play at the same time, when reverb loads.
                this.setReverb();
                fetch(`${this.dataPath}/${file}`)
                    .then(res => res.arrayBuffer())
                    .then(buf => Sounds.decode(this.audioContext, buf))
                    .then(imp => this.createReverb(file, imp));
            }
            else
                this.setReverb(reverb);
        }
        // Set volume
        let volume = either(settings.volume, 1);
        // Remaps the 1.1...1.9 range to 2...10
        if (volume > 1)
            volume = (volume * 10) - 9;
        this.gainNode.gain.value = volume;
        // Set chime, at forced playback rate of 1
        if (!Strings.isNullOrEmpty(settings.voxChime)) {
            let path = `${this.dataPath}/${settings.voxChime}`;
            let req = new VoxRequest(path, 0, this.audioContext);
            req.forceRate = 1;
            this.pendingReqs.push(req);
            ids.unshift(1.0);
        }
        // Begin the pump loop. On iOS, the context may have to be resumed first
        if (this.audioContext.state === 'suspended')
            this.audioContext.resume().then(() => this.pump());
        else
            this.pump();
    }
    /** Stops playing any currently spoken speech and resets state */
    stop() {
        // Already stopped? Do not continue
        if (!this.isSpeaking)
            return;
        // Stop pumping
        clearTimeout(this.pumpTimer);
        this.isSpeaking = false;
        // Cancel all pending requests
        this.pendingReqs.forEach(r => r.cancel());
        // Kill and dereference any currently playing file
        this.scheduledBuffers.forEach(node => {
            node.stop();
            node.disconnect();
        });
        this.nextBegin = 0;
        this.currentIds = undefined;
        this.currentSettings = undefined;
        this.pendingReqs = [];
        this.scheduledBuffers = [];
        console.debug('VOX STOPPED');
        if (this.onstop)
            this.onstop();
    }
    /**
     * Pumps the speech queue, by keeping up to 10 fetch requests for voice files going,
     * and then feeding their data (in enforced order) to the audio chain, one at a time.
     */
    pump() {
        // If the engine has stopped, do not proceed.
        if (!this.isSpeaking || !this.currentIds || !this.currentSettings)
            return;
        // First, schedule fulfilled requests into the audio buffer, in FIFO order
        this.schedule();
        // Then, fill any free pending slots with new requests
        let nextDelay = 0;
        while (this.currentIds[0] && this.pendingReqs.length < 10) {
            let key = this.currentIds.shift();
            // If this key is a number, it's an amount of silence, so add it as the
            // playback delay for the next playable request (if any).
            if (typeof key === 'number') {
                nextDelay += key;
                continue;
            }
            let path = `${this.currentSettings.voxPath}/${key}.mp3`;
            this.pendingReqs.push(new VoxRequest(path, nextDelay, this.audioContext));
            nextDelay = 0;
        }
        // Stop pumping when we're out of IDs to queue and nothing is playing
        if (this.currentIds.length <= 0)
            if (this.pendingReqs.length <= 0)
                if (this.scheduledBuffers.length <= 0)
                    return this.stop();
        this.pumpTimer = setTimeout(this.pump.bind(this), 100);
    }
    schedule() {
        // Stop scheduling if there are no pending requests
        if (!this.pendingReqs[0] || !this.pendingReqs[0].isDone)
            return;
        // Don't schedule if more than 5 nodes are, as not to blow any buffers
        if (this.scheduledBuffers.length > 5)
            return;
        let req = this.pendingReqs.shift();
        // If the next request errored out (buffer missing), skip it
        if (!req.buffer) {
            console.log('VOX CLIP SKIPPED:', req.path);
            return this.schedule();
        }
        // If this is the first clip being played, start from current wall-clock
        if (this.nextBegin === 0)
            this.nextBegin = this.audioContext.currentTime;
        console.log('VOX CLIP QUEUED:', req.path, req.buffer.duration, this.nextBegin);
        // Base latency not available in some browsers
        let latency = (this.audioContext.baseLatency || 0.01) + 0.15;
        let node = this.audioContext.createBufferSource();
        let rate = req.forceRate || this.currentSettings.rate || 1;
        node.buffer = req.buffer;
        // Remap rate from 0.1..1.9 to 0.8..1.5
        if (rate < 1)
            rate = (rate * 0.2) + 0.8;
        else if (rate > 1)
            rate = (rate * 0.5) + 0.5;
        // Calculate delay and duration based on playback rate
        let delay = req.delay * (1 / rate);
        let duration = node.buffer.duration * (1 / rate);
        node.playbackRate.value = rate;
        node.connect(this.gainNode);
        node.start(this.nextBegin + delay);
        this.scheduledBuffers.push(node);
        this.nextBegin += (duration + delay - latency);
        // Fire on-first-speak event
        if (!this.begunSpeaking) {
            this.begunSpeaking = true;
            if (this.onspeak)
                this.onspeak();
        }
        // Have this buffer node remove itself from the schedule when done
        node.onended = _ => {
            console.log('VOX CLIP ENDED:', req.path);
            let idx = this.scheduledBuffers.indexOf(node);
            if (idx !== -1)
                this.scheduledBuffers.splice(idx, 1);
        };
    }
    createReverb(file, impulse) {
        this.impulses[file] = this.audioContext.createConvolver();
        this.impulses[file].buffer = impulse;
        this.impulses[file].normalize = true;
        this.setReverb(this.impulses[file]);
        console.debug('VOX REVERB LOADED:', file);
    }
    setReverb(reverb) {
        if (this.currentReverb) {
            this.currentReverb.disconnect();
            this.currentReverb = undefined;
        }
        this.filterNode.disconnect();
        if (reverb) {
            this.currentReverb = reverb;
            this.filterNode.connect(reverb);
            reverb.connect(this.audioContext.destination);
        }
        else
            this.filterNode.connect(this.audioContext.destination);
    }
}
/** List of impulse responses that come with RAG */
VoxEngine.REVERBS = {
    '': 'None',
    'ir.stalbans.wav': 'The Lady Chapel, St Albans Cathedral',
    'ir.middle_tunnel.wav': 'Innocent Railway Tunnel, Edinburgh',
    'ir.grange-centre.wav': 'Grange stone circle, County Limerick'
};
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Represents a request for a vox file, immediately begun on creation */
class VoxRequest {
    constructor(path, delay, context) {
        /** Whether this request is done and ready for handling (even if failed) */
        this.isDone = false;
        console.debug('VOX REQUEST:', path);
        this.context = context;
        this.path = path;
        this.delay = delay;
        this.abort = new AbortController();
        // https://developers.google.com/web/updates/2017/09/abortable-fetch
        fetch(path, { signal: this.abort.signal })
            .then(this.onFulfill.bind(this))
            .catch(this.onError.bind(this));
        // Timeout all fetches by 10 seconds
        setTimeout(_ => this.abort.abort(), 10 * 1000);
    }
    /** Cancels this request from proceeding any further */
    cancel() {
        this.abort.abort();
    }
    /** Begins decoding the loaded MP3 voice file to raw audio data */
    onFulfill(res) {
        if (!res.ok)
            throw Error(`VOX NOT FOUND: ${res.status} @ ${this.path}`);
        res.arrayBuffer().then(this.onArrayBuffer.bind(this));
    }
    /** Takes the array buffer from the fulfilled fetch and decodes it */
    onArrayBuffer(buffer) {
        Sounds.decode(this.context, buffer)
            .then(this.onDecode.bind(this))
            .catch(this.onError.bind(this));
    }
    /** Called when the fetched buffer is decoded successfully */
    onDecode(buffer) {
        this.buffer = buffer;
        this.isDone = true;
    }
    /** Called if the fetch or decode stages fail */
    onError(err) {
        console.log('REQUEST FAIL:', err);
        this.isDone = true;
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
// TODO: Make all views use this class
/** Base class for a view; anything with a base DOM element */
class ViewBase {
    /** Creates this base view, attaching it to the element matching the given query */
    constructor(domQuery) {
        if (typeof domQuery === 'string')
            this.dom = DOM.require(domQuery);
        else
            this.dom = domQuery;
    }
    /** Gets this view's child element matching the given query */
    attach(query) {
        return DOM.require(query, this.dom);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
///<reference path="viewBase.ts"/>
/** Controller for the disclaimer screen */
class Disclaimer extends ViewBase {
    constructor() {
        super('#disclaimerScreen');
        /** Reference to the "continue" button */
        this.btnDismiss = this.attach('#btnDismiss');
    }
    /** Opens the disclaimer for first time users */
    disclaim() {
        if (RAG.config.readDisclaimer)
            return;
        this.lastActive = document.activeElement;
        RAG.views.main.hidden = true;
        this.dom.hidden = false;
        this.btnDismiss.onclick = this.onDismiss.bind(this);
        this.btnDismiss.focus();
    }
    /** Persists the dismissal to storage and restores the view underneath */
    onDismiss() {
        RAG.config.readDisclaimer = true;
        this.dom.hidden = true;
        // Dashboard role: the editor view stays hidden — the panel is what
        // shows. Screen role: restore the marquee editor.
        RAG.views.main.hidden = RAG.isDashboardRole();
        this.btnDismiss.onclick = null;
        RAG.config.save();
        if (this.lastActive) {
            this.lastActive.focus();
            this.lastActive = undefined;
        }
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Controller for the phrase editor */
class Editor {
    constructor() {
        this.dom = DOM.require('#editor');
        document.body.onclick = this.onClick.bind(this);
        window.onresize = this.onResize.bind(this);
        this.dom.onscroll = this.onScroll.bind(this);
        this.dom.textContent = L.EDITOR_INIT;
    }
    /** Replaces the editor with a root phraseset reference, and expands it into HTML */
    generate() {
        this.dom.innerHTML = '<phraseset ref="root" />';
        RAG.phraser.process(this.dom);
        this.attachControls();
        // For scroll-past padding under the phrase
        let padding = document.createElement('span');
        padding.className = 'bottomPadding';
        this.dom.appendChild(padding);
    }
    /** Reprocesses all phraseset elements of the given ref, if their index has changed */
    refreshPhraseset(ref) {
        // Note, this could potentially bug out if a phraseset's descendant references
        // the same phraseset (recursion). But this is okay because phrasesets should
        // never include themselves, even eventually.
        this.dom.querySelectorAll(`span[data-type=phraseset][data-ref=${ref}]`)
            .forEach(_ => {
            let element = _;
            let newElement = document.createElement('phraseset');
            let chance = element.dataset['chance'];
            newElement.setAttribute('ref', ref);
            if (chance)
                newElement.setAttribute('chance', chance);
            element.parentElement.replaceChild(newElement, element);
            RAG.phraser.process(newElement.parentElement);
            this.attachControls();
        });
    }
    /**
     * Gets a static NodeList of all phrase elements of the given query.
     *
     * @param query Query string to add onto the `span` selector
     * @returns Node list of all elements matching the given span query
     */
    getElementsByQuery(query) {
        return this.dom.querySelectorAll(`span${query}`);
    }
    /** Gets the current phrase's root DOM element */
    getPhrase() {
        return this.dom.firstElementChild;
    }
    /** Gets the current phrase in the editor as text, excluding the hidden parts */
    getText() {
        return DOM.getCleanedVisibleText(this.dom);
    }
    /**
     * Finds all phrase elements of the given type, and sets their text to given value.
     *
     * @param type Original XML name of elements to replace contents of
     * @param value New text for the found elements to set
     */
    setElementsText(type, value) {
        this.getElementsByQuery(`[data-type=${type}]`)
            .forEach(element => element.textContent = value);
    }
    /** Closes any currently open editor dialogs */
    closeDialog() {
        if (this.currentPicker)
            this.currentPicker.close();
        if (this.domEditing) {
            this.domEditing.removeAttribute('editing');
            this.domEditing.classList.remove('above', 'below');
        }
        this.currentPicker = undefined;
        this.domEditing = undefined;
    }
    /** Creates and attaches UI controls for certain phrase elements */
    attachControls() {
        this.dom.querySelectorAll('[data-type=phraseset]').forEach(span => PhrasesetButton.createAndAttach(span));
        this.dom.querySelectorAll('[data-chance]').forEach(span => {
            CollapseToggle.createAndAttach(span);
            CollapseToggle.update(span);
        });
    }
    /** Handles a click anywhere in the window depending on the context */
    onClick(ev) {
        let target = ev.target;
        let type = target ? target.dataset['type'] : undefined;
        let picker = type ? RAG.views.getPicker(type) : undefined;
        if (!target)
            return this.closeDialog();
        // Ignore clicks of inner elements
        if (target.classList.contains('inner'))
            return;
        // Ignore clicks to any inner document or unowned element
        if (!document.body.contains(target))
            return;
        // Ignore clicks to any element of already open pickers
        if (this.currentPicker)
            if (this.currentPicker.dom.contains(target))
                return;
        // Cancel any open editors
        let prevTarget = this.domEditing;
        this.closeDialog();
        // Don't handle phrase or phrasesets - only via their buttons
        if (type === 'phrase' || type === 'phraseset')
            return;
        // If clicking the element already being edited, don't reopen
        if (target === prevTarget)
            return;
        let toggle = target.closest('.toggle');
        let choosePhrase = target.closest('.choosePhrase');
        // Handle collapsible elements
        if (toggle)
            this.toggleCollapsiable(toggle);
        // Special case for phraseset chooser
        else if (choosePhrase) {
            // TODO: Assert here?
            target = choosePhrase.parentElement;
            picker = RAG.views.getPicker(target.dataset['type']);
            this.openPicker(target, picker);
        }
        // Find and open picker for the target element
        else if (type && picker)
            this.openPicker(target, picker);
    }
    /** Re-layout the currently open picker on resize */
    onResize(_) {
        if (this.currentPicker)
            this.currentPicker.layout();
    }
    /** Re-layout the currently open picker on scroll */
    onScroll(_) {
        if (!this.currentPicker)
            return;
        // Workaround for layout behaving weird when iOS keyboard is open
        if (DOM.isMobile)
            if (this.currentPicker.hasFocus())
                DOM.blurActive();
        this.currentPicker.layout();
    }
    /**
     * Flips the collapse state of a collapsible, and propagates the new state to other
     * collapsibles of the same reference.
     *
     * @param target Collapsible element being toggled
     */
    toggleCollapsiable(target) {
        let parent = target.parentElement;
        let ref = DOM.requireData(parent, 'ref');
        let type = DOM.requireData(parent, 'type');
        let collapased = parent.hasAttribute('collapsed');
        // Propagate new collapse state to all collapsibles of the same ref
        this.dom.querySelectorAll(`span[data-type=${type}][data-ref=${ref}][data-chance]`).forEach(span => {
            Collapsibles.set(span, !collapased);
            CollapseToggle.update(span);
            // Don't move this to Collapsibles.set, as state save/load is handled
            // outside in both usages of setCollapsible.
            RAG.state.setCollapsed(ref, !collapased);
        });
    }
    /**
     * Opens a picker for the given element.
     *
     * @param target Editor element to open the picker for
     * @param picker Picker to open
     */
    openPicker(target, picker) {
        target.setAttribute('editing', 'true');
        this.currentPicker = picker;
        this.domEditing = target;
        picker.open(target);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Controller for the scrolling marquee */
class Marquee {
    constructor() {
        /** Reference ID for the scrolling animation timer */
        this.timer = 0;
        /** Current offset (in pixels) of the scrolling marquee */
        this.offset = 0;
        this.dom = DOM.require('#marquee');
        this.domSpan = document.createElement('span');
        this.dom.innerHTML = '';
        this.dom.appendChild(this.domSpan);
    }
    /** Sets the message on the scrolling marquee, and starts animating it */
    set(msg, animate = true) {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.textContent = msg;
        this.domSpan.style.transform = '';
        if (!animate)
            return;
        // I tried to use CSS animation for this, but couldn't figure out how for a
        // dynamically sized element like the span.
        this.offset = this.dom.clientWidth;
        let limit = -this.domSpan.clientWidth - 100;
        let anim = () => {
            this.offset -= 6;
            this.domSpan.style.transform = `translateX(${this.offset}px)`;
            if (this.offset < limit)
                this.domSpan.style.transform = '';
            else
                this.timer = window.requestAnimationFrame(anim);
        };
        window.requestAnimationFrame(anim);
    }
    /**
     * Swap in new text without restarting the scroll. While the marquee is
     * already scrolling, the new text takes over in place (used for wait
     * countdown ticks, so they don't jump back to the right edge every
     * second); otherwise it behaves like a fresh set().
     */
    setSoft(msg) {
        if (this.timer !== 0) {
            this.domSpan.textContent = msg;
            return;
        }
        this.set(msg);
    }
    /** Stops the current marquee animation */
    stop() {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.style.transform = '';
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
///<reference path="viewBase.ts"/>
/** Controller for the settings screen */
class Settings extends ViewBase {
    constructor() {
        super('#settingsScreen');
        this.btnReset = this.attach('#btnResetSettings');
        this.btnSave = this.attach('#btnSaveSettings');
        this.chkUseVox = this.attach('#chkUseVox');
        this.hintUseVox = this.attach('#hintUseVox');
        this.selVoxVoice = this.attach('#selVoxVoice');
        this.inputVoxPath = this.attach('#inputVoxPath');
        this.selVoxReverb = this.attach('#selVoxReverb');
        this.selVoxChime = this.attach('#selVoxChime');
        this.selSpeechVoice = this.attach('#selSpeechChoice');
        this.rangeSpeechVol = this.attach('#rangeSpeechVol');
        this.rangeSpeechPitch = this.attach('#rangeSpeechPitch');
        this.rangeSpeechRate = this.attach('#rangeSpeechRate');
        this.btnSpeechTest = this.attach('#btnSpeechTest');
        // TODO: Check if VOX is available, disable if not
        this.btnReset.onclick = this.handleReset.bind(this);
        this.btnSave.onclick = this.handleSave.bind(this);
        this.chkUseVox.onchange = this.layout.bind(this);
        this.selVoxVoice.onchange = this.layout.bind(this);
        this.btnSpeechTest.onclick = this.handleVoiceTest.bind(this);
        // Populate list of impulse response files
        DOM.populate(this.selVoxReverb, VoxEngine.REVERBS, RAG.config.voxReverb);
        // Populate the legal & acknowledgements block
        Linkdown.loadInto('ABOUT.md', '#aboutBlock');
    }
    /** Opens the settings screen */
    open() {
        // The voice list has to be populated each open, in case it changes
        this.populateVoiceList();
        if (!RAG.speech.voxAvailable) {
            // TODO : Localize
            this.chkUseVox.checked = false;
            this.chkUseVox.disabled = true;
            this.hintUseVox.innerHTML = '<strong>VOX engine</strong> is unavailable.' +
                ' Your browser or device may not be supported; please check the console' +
                ' for more information.';
        }
        else
            this.chkUseVox.checked = RAG.config.voxEnabled;
        this.selVoxVoice.value = RAG.config.voxPath;
        this.inputVoxPath.value = RAG.config.voxCustomPath;
        this.selVoxReverb.value = RAG.config.voxReverb;
        this.selVoxChime.value = RAG.config.voxChime;
        this.selSpeechVoice.value = RAG.config.speechVoice;
        this.rangeSpeechVol.valueAsNumber = RAG.config.speechVol;
        this.rangeSpeechPitch.valueAsNumber = RAG.config.speechPitch;
        this.rangeSpeechRate.valueAsNumber = RAG.config.speechRate;
        this.layout();
        this.dom.hidden = false;
        this.btnSave.focus();
    }
    /** Closes the settings screen */
    close() {
        this.cancelReset();
        RAG.speech.stop();
        this.dom.hidden = true;
        // Return focus to the panel button that opened us, if we were
        // opened from the dashboard panel; the editor view has no opener.
        let opener = document.getElementById('dashSettings');
        if (opener)
            opener.focus();
    }
    /** Calculates form layout and control visibility based on state */
    layout() {
        let voxEnabled = this.chkUseVox.checked;
        let voxCustom = (this.selVoxVoice.value === '');
        DOM.toggleHiddenAll([this.selSpeechVoice, !voxEnabled], [this.rangeSpeechPitch, !voxEnabled], [this.selVoxVoice, voxEnabled], [this.inputVoxPath, voxEnabled && voxCustom], [this.selVoxReverb, voxEnabled], [this.selVoxChime, voxEnabled]);
    }
    /** Clears and populates the voice list */
    populateVoiceList() {
        this.selSpeechVoice.innerHTML = '';
        let voices = RAG.speech.browserVoices;
        // Handle empty list
        if (voices === {}) {
            let option = DOM.addOption(this.selSpeechVoice, L.ST_SPEECH_EMPTY);
            option.disabled = true;
        }
        // https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
        else
            for (let name in voices)
                DOM.addOption(this.selSpeechVoice, `${name} (${voices[name].lang})`, name);
    }
    /** Handles the reset button, with a confirm step that cancels after 15 seconds */
    handleReset() {
        if (!this.resetTimeout) {
            this.resetTimeout = setTimeout(this.cancelReset.bind(this), 15000);
            this.btnReset.innerText = L.ST_RESET_CONFIRM;
            this.btnReset.title = L.ST_RESET_CONFIRM_T;
            return;
        }
        RAG.config.reset();
        RAG.speech.stop();
        this.cancelReset();
        this.open();
        alert(L.ST_RESET_DONE);
    }
    /** Cancel the reset timeout and restore the reset button to normal */
    cancelReset() {
        window.clearTimeout(this.resetTimeout);
        this.btnReset.innerText = L.ST_RESET;
        this.btnReset.title = L.ST_RESET_T;
        this.resetTimeout = undefined;
    }
    /** Handles the save button, saving config to storage */
    handleSave() {
        RAG.config.voxEnabled = this.chkUseVox.checked;
        RAG.config.voxPath = this.selVoxVoice.value;
        RAG.config.voxCustomPath = this.inputVoxPath.value;
        RAG.config.voxReverb = this.selVoxReverb.value;
        RAG.config.voxChime = this.selVoxChime.value;
        RAG.config.speechVoice = this.selSpeechVoice.value;
        // parseFloat instead of valueAsNumber; see Architecture.md
        RAG.config.speechVol = parseFloat(this.rangeSpeechVol.value);
        RAG.config.speechPitch = parseFloat(this.rangeSpeechPitch.value);
        RAG.config.speechRate = parseFloat(this.rangeSpeechRate.value);
        RAG.config.save();
        this.close();
    }
    /** Handles the speech test button, speaking a test phrase */
    handleVoiceTest(ev) {
        ev.preventDefault();
        RAG.speech.stop();
        this.btnSpeechTest.disabled = true;
        // Has to execute on a delay, as speech cancel is unreliable without it
        window.setTimeout(() => {
            this.btnSpeechTest.disabled = false;
            let phrase = document.createElement('div');
            phrase.innerHTML = '<phrase ref="sample"/>';
            RAG.phraser.process(phrase);
            RAG.speech.speak(phrase.firstElementChild, {
                useVox: this.chkUseVox.checked,
                voxPath: this.selVoxVoice.value || this.inputVoxPath.value,
                voxReverb: this.selVoxReverb.value,
                voxChime: this.selVoxChime.value,
                voiceName: this.selSpeechVoice.value,
                volume: this.rangeSpeechVol.valueAsNumber,
                pitch: this.rangeSpeechPitch.valueAsNumber,
                rate: this.rangeSpeechRate.valueAsNumber
            });
        }, 200);
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/**
 * Controller for the top toolbar of the step editor view: Play, Stop,
 * Shuffle (regenerate), Update Step, and Close.
 *
 * Both pages (index.html and screen.html) carry the identical toolbar.
 * The dashboard role reveals it only while editing a step; the screen
 * role hides it at boot, so its buttons are never used there.
 */
class Toolbar {
    constructor() {
        this.dom = DOM.require('#toolbar');
        this.btnPlay = DOM.require('#btnPlay');
        this.btnStop = DOM.require('#btnStop');
        this.btnGenerate = DOM.require('#btnShuffle');
        this.btnUpdateStep = DOM.require('#btnUpdateStep');
        this.btnClose = DOM.require('#btnClose');
        this.btnPlay.onclick = this.handlePlay.bind(this);
        this.btnStop.onclick = this.handleStop.bind(this);
        this.btnGenerate.onclick = this.handleGenerate.bind(this);
        this.btnUpdateStep.onclick = this.handleUpdateStep.bind(this);
        this.btnClose.onclick = this.handleClose.bind(this);
        if (!RAG.config.clickedGenerate) {
            this.btnGenerate.classList.add('throb');
            this.btnGenerate.focus();
        }
        else
            this.btnPlay.focus();
    }
    /** Plays the current announcement through the speech engine */
    handlePlay() {
        RAG.speech.stop();
        this.btnPlay.disabled = true;
        window.setTimeout(this.handlePlay2.bind(this), 200);
    }
    handlePlay2() {
        let hasSpoken = false;
        let speechText = RAG.views.editor.getText();
        this.btnPlay.hidden = true;
        this.btnPlay.disabled = false;
        this.btnStop.hidden = false;
        RAG.views.marquee.set('Loading VOX...', false);
        let timeout = window.setTimeout(() => {
            clearTimeout(timeout);
            RAG.speech.stop();
        }, 10 * 1000);
        RAG.speech.onspeak = () => {
            clearTimeout(timeout);
            RAG.views.marquee.set(speechText);
            hasSpoken = true;
            RAG.speech.onspeak = undefined;
        };
        RAG.speech.onstop = () => {
            clearTimeout(timeout);
            this.handleStop();
            if (!hasSpoken && RAG.config.voxEnabled) {
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
    handleStop(ev) {
        RAG.speech.onspeak = undefined;
        RAG.speech.onstop = undefined;
        this.btnPlay.hidden = false;
        if (document.activeElement === this.btnStop)
            this.btnPlay.focus();
        this.btnStop.hidden = true;
        RAG.speech.stop();
        if (ev)
            RAG.views.marquee.set(RAG.views.editor.getText(), false);
    }
    handleGenerate() {
        this.btnGenerate.classList.remove('throb');
        RAG.generate();
        RAG.config.clickedGenerate = true;
    }
    /**
     * Writes the current announcement back into the selected scenario step
     * (the one opened for editing from the dashboard), then closes the
     * editor view to return to the scenario dashboard.
     */
    handleUpdateStep() {
        let id = localStorage.getItem('rag.currentScenarioId');
        let idxStr = localStorage.getItem('rag.selectedStepIndex');
        if (!id || idxStr === null) {
            alert('No scenario/step selected. Open the dashboard and click a step first.');
            return;
        }
        let idx = parseInt(idxStr);
        let raw = localStorage.getItem('rag.scenarios');
        if (!raw) {
            alert('No scenarios saved yet.');
            return;
        }
        let scenarios = JSON.parse(raw);
        let sc = scenarios.find((s) => s.id === id);
        if (!sc || !sc.steps[idx]) {
            alert('Step not found.');
            return;
        }
        sc.steps[idx].stateJson = JSON.stringify(RAG.state);
        sc.updatedAt = Date.now();
        localStorage.setItem('rag.scenarios', JSON.stringify(scenarios));
        RAG.dashboard.closeEdit();
    }
    /**
     * Close request from the ✕ button: the dashboard closes straight away
     * if the step has no unsaved changes, and asks first otherwise.
     */
    handleClose() {
        RAG.dashboard.requestClose();
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Manages UI elements and their logic */
class Views {
    constructor() {
        this.main = DOM.require('#mainScreen');
        this.disclaimer = new Disclaimer();
        this.editor = new Editor();
        this.marquee = new Marquee();
        this.settings = new Settings();
        this.toolbar = new Toolbar();
        this.pickers = {};
        [
            new CoachPicker(),
            new ExcusePicker(),
            new IntegerPicker(),
            new NamedPicker(),
            new PhrasesetPicker(),
            new PlatformPicker(),
            new ServicePicker(),
            new StationPicker(),
            new StationListPicker(),
            new TimePicker()
        ].forEach(picker => this.pickers[picker.xmlTag] = picker);
        // Global hotkeys
        document.body.onkeydown = this.onInput.bind(this);
        // Apply iOS-specific CSS fixes
        if (DOM.isiOS)
            document.body.classList.add('ios');
    }
    /** Gets the picker that handles a given tag, if any */
    getPicker(xmlTag) {
        return this.pickers[xmlTag];
    }
    /**
     * Handle ESC: closes an open picker or the settings screen. With nothing
     * else open, in the dashboard role it asks to leave the step editor view
     * — the dashboard confirms first if there are unsaved changes. One layer
     * per press, so dismissing a picker does not leave the editor with it.
     */
    onInput(ev) {
        if (ev.key !== 'Escape')
            return;
        let layerOpen = !!document.querySelector('.picker:not([hidden])')
            || !document.getElementById('settingsScreen').hidden;
        this.editor.closeDialog();
        this.settings.close();
        if (!layerOpen && RAG.isDashboardRole() && RAG.dashboard && RAG.dashboard.editing)
            RAG.dashboard.requestClose();
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
// Global methods for asserting the existence of values. To keep the chance of errors
// within asserts low, no localization is used here.
/** Asserts that the given value exists; neither undefined nor null */
function assert(value) {
    if (value === undefined || value === null)
        throw AssertError('Value does not exist', assert);
    return value;
}
/** Asserts that the given value exists and is a number */
function assertNumber(value) {
    if (typeof value !== 'number' || isNaN(value))
        throw AssertError('Value is not a number', assertNumber);
}
/** Creates an assertion error that begins the stack at the assert's call site  */
function AssertError(message, caller) {
    let error = Error(`Assertion failed: ${message}`);
    if (Error.captureStackTrace)
        Error.captureStackTrace(error, caller);
    return error;
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Utility methods for dealing with collapsible elements */
class Collapsibles {
    /**
     * Sets the collapse state of a collapsible element.
     *
     * @param span The encapsulating collapsible element
     * @param state True to collapse, false to open
     */
    static set(span, state) {
        if (state)
            span.setAttribute('collapsed', '');
        else
            span.removeAttribute('collapsed');
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Sugar for choosing second value if first is undefined, instead of falsy */
function either(value, value2) {
    return (value === undefined || value === null) ? value2 : value;
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Utility methods for dealing with the DOM */
class DOM {
    /** Whether the window is thinner than a specific size (and, thus, is "mobile") */
    static get isMobile() {
        return document.body.clientWidth <= 500;
    }
    /** Whether RAG appears to be running on an iOS device */
    static get isiOS() {
        return navigator.platform.match(/iPhone|iPod|iPad/gi) !== null;
    }
    /**
     * Finds the value of the given attribute from the given element, or returns the given
     * default value if unset.
     *
     * @param element Element to get the attribute of
     * @param attr Name of the attribute to get the value of
     * @param def Default value if attribute isn't set
     * @returns The given attribute's value, or default value if unset
     */
    static getAttr(element, attr, def) {
        return element.hasAttribute(attr)
            ? element.getAttribute(attr)
            : def;
    }
    /**
     * Finds an element from the given document, throwing an error if no match is found.
     *
     * @param query CSS selector query to use
     * @param parent Parent object to search; defaults to document
     * @returns The first element to match the given query
     */
    static require(query, parent = window.document) {
        let result = parent.querySelector(query);
        if (!result)
            throw AssertError(L.DOM_MISSING(query), DOM.require);
        return result;
    }
    /**
     * Finds the value of the given attribute from the given element, throwing an error
     * if the attribute is missing.
     *
     * @param element Element to get the attribute of
     * @param attr Name of the attribute to get the value of
     * @returns The given attribute's value
     */
    static requireAttr(element, attr) {
        if (!element.hasAttribute(attr))
            throw AssertError(L.ATTR_MISSING(attr), DOM.requireAttr);
        return element.getAttribute(attr);
    }
    /**
     * Finds the value of the given key of the given element's dataset, throwing an error
     * if the value is missing or empty.
     *
     * @param element Element to get the data of
     * @param key Key to get the value of
     * @returns The given dataset's value
     */
    static requireData(element, key) {
        let value = element.dataset[key];
        if (Strings.isNullOrEmpty(value))
            throw AssertError(L.DATA_MISSING(key), DOM.requireData);
        return value;
    }
    /**
     * Blurs (unfocuses) the currently focused element.
     *
     * @param parent If given, only blurs if active is descendant
     */
    static blurActive(parent = document.body) {
        let active = document.activeElement;
        if (active && active.blur && parent.contains(active))
            active.blur();
    }
    /**
     * Deep clones all the children of the given element, into the target element.
     * Using innerHTML would be easier, however it handles self-closing tags poorly.
     *
     * @param source Element whose children to clone
     * @param target Element to append the cloned children to
     */
    static cloneInto(source, target) {
        for (let i = 0; i < source.childNodes.length; i++)
            target.appendChild(source.childNodes[i].cloneNode(true));
    }
    /**
     * Sugar for creating and adding an option element to a select element.
     *
     * @param select Select list element to add the option to
     * @param text Label for the option
     * @param value Value for the option
     */
    static addOption(select, text, value = '') {
        let option = document.createElement('option');
        option.text = text;
        option.value = value;
        select.add(option);
        return option;
    }
    /**
     * Sugar for populating a select element with items from a given object.
     *
     * @param list Select element to populate
     * @param items A dictionary where keys act like values, and values like labels
     * @param selected If matches a dictionary key, that key is the pre-selected option
     */
    static populate(list, items, selected) {
        for (let value in items) {
            let label = items[value];
            let opt = DOM.addOption(list, label, value);
            if (selected !== undefined && value === selected)
                opt.selected = true;
        }
    }
    /**
     * Gets the text content of the given element, excluding the text of hidden children.
     * Be warned; this method uses RAG-specific code.
     *
     * @see https://stackoverflow.com/a/19986328
     * @param element Element to recursively get text content of
     * @returns Text content of given element, without text of hidden children
     */
    static getVisibleText(element) {
        if (element.nodeType === Node.TEXT_NODE)
            return element.textContent || '';
        else if (element.tagName === 'BUTTON')
            return '';
        // Return blank (skip) if child of a collapsed element. Previously, this used
        // getComputedStyle, but that doesn't work if the element is part of an orphaned
        // phrase (as happens with the phraseset picker).
        let parent = element.parentElement;
        if (parent && parent.hasAttribute('collapsed'))
            return '';
        let text = '';
        for (let i = 0; i < element.childNodes.length; i++)
            text += DOM.getVisibleText(element.childNodes[i]);
        return text;
    }
    /**
     * Gets the text content of the given element, excluding the text of hidden children,
     * and excess whitespace as a result of converting from HTML/XML.
     *
     * @see https://stackoverflow.com/a/19986328
     * @param element Element to recursively get text content of
     * @returns Cleaned text of given element, without text of hidden children
     */
    static getCleanedVisibleText(element) {
        return Strings.clean(DOM.getVisibleText(element));
    }
    /**
     * Scans for the next focusable sibling from a given element, skipping hidden or
     * unfocusable elements. If the end of the container is hit, the scan wraps around.
     *
     * @param from Element to start scanning from
     * @param dir Direction; -1 for left (previous), 1 for right (next)
     * @returns The next available sibling, or null if none found
     */
    static getNextFocusableSibling(from, dir) {
        if (dir === 0)
            throw Error(L.BAD_DIRECTION(dir));
        let current = from;
        let parent = from.parentElement;
        if (!parent)
            return null;
        while (true) {
            // Proceed to next element, or wrap around if hit the end of parent
            if (dir < 0)
                current = current.previousElementSibling
                    || parent.lastElementChild;
            else if (dir > 0)
                current = current.nextElementSibling
                    || parent.firstElementChild;
            // If we've come back to the starting element, nothing was found
            if (current === from)
                return null;
            // If this element isn't hidden and is focusable, return it!
            if (!current.hidden)
                if (current.hasAttribute('tabindex'))
                    return current;
        }
    }
    /**
     * Gets the index of a child element, relevant to its parent.
     *
     * @see https://stackoverflow.com/a/9132575/3354920
     * @param child Child element to get the index of
     */
    static indexOf(child) {
        let parent = child.parentElement;
        return parent
            ? Array.prototype.indexOf.call(parent.children, child)
            : -1;
    }
    /**
     * Gets the index of a child node, relevant to its parent. Used for text nodes.
     *
     * @see https://stackoverflow.com/a/9132575/3354920
     * @param child Child node to get the index of
     */
    static nodeIndexOf(child) {
        let parent = child.parentNode;
        return parent
            ? Array.prototype.indexOf.call(parent.childNodes, child)
            : -1;
    }
    /**
     * Toggles the hidden attribute of the given element, and all its labels.
     *
     * @param element Element to toggle the hidden attribute of
     * @param force Optional value to force toggling to
     */
    static toggleHidden(element, force) {
        let hidden = !element.hidden;
        // Do nothing if already toggled to the forced state
        if (hidden === force)
            return;
        element.hidden = hidden;
        document.querySelectorAll(`[for='${element.id}']`)
            .forEach(l => l.hidden = hidden);
    }
    /**
     * Toggles the hidden attribute of a group of elements, in bulk.
     *
     * @param list An array of argument pairs for {toggleHidden}
     */
    static toggleHiddenAll(...list) {
        list.forEach(l => this.toggleHidden(...l));
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** A very small subset of Markdown for hyperlinking a block of text */
class Linkdown {
    /**
     * Attempts to load the given linkdown file, parse and set it as an element's text.
     *
     * @param path Relative or absolute URL to fetch the linkdown from
     * @param query DOM query for the object to put the text into
     */
    static loadInto(path, query) {
        let dom = DOM.require(query);
        dom.innerText = `Loading text from '${path}'...`;
        fetch(path)
            .then(req => req.text())
            .then(txt => dom.innerHTML = Linkdown.parse(txt))
            .catch(err => dom.innerText = `Could not load '${path}': ${err}`);
    }
    /**
     * Parses the given text from Linkdown to HTML, converting tagged text into links
     * using a given list of references.
     *
     * @param text Linkdown text to transform to HTML
     */
    static parse(text) {
        let links = {};
        // First, sanitize any HTML
        text = text.replace('<', '&lt;').replace('>', '&gt;');
        // Then, get the list of references, removing them from the text
        text = text.replace(this.REGEX_REF, (_, k, v) => {
            links[k] = v;
            return '';
        });
        // Finally, replace each tagged part of text with a link element. If a tag has
        // an invalid reference, it is ignored.
        return text.replace(this.REGEX_LINK, (match, t, k) => links[k]
            ? `<a href='${links[k]}' target="_blank" rel="noopener">${t}</a>`
            : match);
    }
}
/** Regex pattern for matching linked text */
Linkdown.REGEX_LINK = /\[([\s\S]+?)\]\[(\d+)\]/gmi;
/** Regex pattern for matching link references */
Linkdown.REGEX_REF = /^\[(\d+)\]:\s+(\S+)$/gmi;
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Utility methods for parsing data from strings */
class Parse {
    /** Parses a given string into a boolean */
    static boolean(str) {
        str = str.toLowerCase();
        if (str === 'true' || str === '1')
            return true;
        if (str === 'false' || str === '0')
            return false;
        throw Error(L.BAD_BOOLEAN(str));
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Utility methods for generating random data */
class Random {
    /**
     * Picks a random integer from the given range.
     *
     * @param min Minimum integer to pick, inclusive
     * @param max Maximum integer to pick, inclusive
     * @returns Random integer within the given range
     */
    static int(min = 0, max = 1) {
        return Math.round(Math.random() * (max - min)) + min;
    }
    /** Picks a random element from a given array-like object with a length property */
    static array(arr) {
        return arr[Random.int(0, arr.length - 1)];
    }
    /** Splices a random element from a given array */
    static arraySplice(arr) {
        return arr.splice(Random.int(0, arr.length - 1), 1)[0];
    }
    /** Picks a random key from a given object */
    static objectKey(obj) {
        return Random.array(Object.keys(obj));
    }
    /**
     * Picks true or false.
     *
     * @param chance Chance out of 100, to pick `true`
     */
    static bool(chance = 50) {
        return Random.int(0, 100) < chance;
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Utility class for audio functionality */
class Sounds {
    /**
     * Decodes the given audio file into raw audio data. This is a wrapper for the older
     * callback-based syntax, since it is the only one iOS currently supports.
     *
     * @param context Audio context to use for decoding
     * @param buffer Buffer of encoded file data (e.g. mp3) to decode
     */
    static decode(context, buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                return context.decodeAudioData(buffer, resolve, reject);
            });
        });
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Utility methods for dealing with strings */
class Strings {
    /** Checks if the given string is null, or empty (whitespace only or zero-length) */
    static isNullOrEmpty(str) {
        return !str || !str.trim();
    }
    /**
     * Pretty-print's a given list of stations, with context sensitive extras.
     *
     * @param codes List of station codes to join
     * @param context List's context. If 'calling', handles special case
     * @returns Pretty-printed list of given stations
     */
    static fromStationList(codes, context) {
        let result = '';
        let names = codes.slice();
        names.forEach((c, i) => names[i] = RAG.database.getStation(c));
        if (names.length === 1)
            result = (context === 'calling')
                ? `${names[0]} only`
                : names[0];
        else {
            let lastStation = names.pop();
            result = names.join(', ');
            result += ` and ${lastStation}`;
        }
        return result;
    }
    /**
     * Pretty-prints the given date or hours and minutes into a 24-hour time (e.g. 01:09).
     *
     * @param hours Hours, from 0 to 23, or Date object
     * @param minutes Minutes, from 0 to 59
     */
    static fromTime(hours, minutes = 0) {
        if (hours instanceof Date) {
            minutes = hours.getMinutes();
            hours = hours.getHours();
        }
        return hours.toString().padStart(2, '0') + ':' +
            minutes.toString().padStart(2, '0');
    }
    /** Cleans up the given text of excess whitespace and any newlines */
    static clean(text) {
        return text.trim()
            .replace(/[\n\r]/gi, '')
            .replace(/\s{2,}/gi, ' ')
            .replace(/“\s+/gi, '“')
            .replace(/\s+”/gi, '”')
            .replace(/\s([.,])/gi, '$1');
    }
    /** Strongly compresses the given string to one more filename friendly */
    static filename(text) {
        return text
            .toLowerCase()
            // Replace plurals
            .replace(/ies\b/g, 'y')
            // Remove common words
            .replace(/\b(a|an|at|be|of|on|the|to|in|is|has|by|with)\b/g, '')
            .trim()
            // Convert spaces to underscores
            .replace(/\s+/g, '_')
            // Remove all non-alphanumericals
            .replace(/[^a-z0-9_]/g, '')
            // Limit to 100 chars; most systems support max. 255 bytes in filenames
            .substring(0, 100);
    }
    /** Gets the first match of a pattern in a string, or undefined if not found */
    static firstMatch(text, pattern, idx) {
        let match = text.match(pattern);
        return (match && match[idx])
            ? match[idx]
            : undefined;
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Cross-window communication channel using BroadcastChannel */
class ScenarioChannel {
    constructor() {
        this.channel = null;
        this.listeners = {};
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                this.channel = new BroadcastChannel('rag_scenario_channel');
                this.channel.onmessage = (event) => {
                    let msg = event.data;
                    if (msg && msg.type) {
                        let handlers = this.listeners[msg.type];
                        if (handlers) {
                            handlers.forEach(h => h(msg));
                        }
                    }
                };
            }
            catch (e) {
                console.warn('BroadcastChannel not supported or failed:', e);
            }
        }
    }
    on(type, handler) {
        if (!this.listeners[type])
            this.listeners[type] = [];
        this.listeners[type].push(handler);
    }
    off(type, handler) {
        let handlers = this.listeners[type];
        if (!handlers)
            return;
        let i = handlers.indexOf(handler);
        if (i !== -1)
            handlers.splice(i, 1);
    }
    send(type, payload = {}) {
        if (this.channel) {
            try {
                this.channel.postMessage(Object.assign({ type: type }, payload));
            }
            catch (e) {
                console.warn('Failed to send BroadcastChannel message:', e);
            }
        }
    }
}
window.ScenarioChannel = ScenarioChannel;
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Manages data for excuses, trains, services and stations */
class Database {
    constructor(dataRefs) {
        let query = dataRefs.phrasesetEmbed;
        let iframe = DOM.require(query);
        if (!iframe.contentDocument)
            throw Error(L.DB_ELEMENT_NOT_PHRASESET_IFRAME(query));
        this.phrasesets = iframe.contentDocument;
        this.excuses = dataRefs.excusesData;
        this.named = dataRefs.namedData;
        this.services = dataRefs.servicesData;
        this.stations = dataRefs.stationsData;
        this.stationsCount = Object.keys(this.stations).length;
        console.log('[Database] Entries loaded:');
        console.log('\tExcuses:', this.excuses.length);
        console.log('\tNamed trains:', this.named.length);
        console.log('\tServices:', this.services.length);
        console.log('\tStations:', this.stationsCount);
    }
    /** Picks a random excuse for a delay or cancellation */
    pickExcuse() {
        return Random.array(this.excuses);
    }
    /** Picks a random named train */
    pickNamed() {
        return Random.array(this.named);
    }
    /**
     * Clones and gets phrase with the given ID, or null if it doesn't exist.
     *
     * @param id ID of the phrase to get
     */
    getPhrase(id) {
        let result = this.phrasesets.querySelector('phrase#' + id);
        if (result)
            result = result.cloneNode(true);
        return result;
    }
    /**
     * Gets a phraseset with the given ID, or null if it doesn't exist. Note that the
     * returned phraseset comes from the XML document, so it should not be mutated.
     *
     * @param id ID of the phraseset to get
     */
    getPhraseset(id) {
        return this.phrasesets.querySelector('phraseset#' + id);
    }
    /** Picks a random rail network name */
    pickService() {
        return Random.array(this.services);
    }
    /**
     * Picks a random station code from the dataset.
     *
     * @param exclude List of codes to exclude. May be ignored if search takes too long.
     */
    pickStationCode(exclude) {
        // Give up finding random station that's not in the given list, if we try more
        // times then there are stations. Inaccurate, but avoids infinite loops.
        if (exclude)
            for (let i = 0; i < this.stationsCount; i++) {
                let value = Random.objectKey(this.stations);
                if (!exclude.includes(value))
                    return value;
            }
        return Random.objectKey(this.stations);
    }
    /**
     * Gets the station name from the given three letter code.
     *
     * @param code Three-letter station code to get the name of
     * @returns Station name for the given code
     */
    getStation(code) {
        let station = this.stations[code];
        if (!station)
            return L.DB_UNKNOWN_STATION(code);
        if (typeof station === 'string')
            return Strings.isNullOrEmpty(station)
                ? L.DB_EMPTY_STATION(code)
                : station;
        else
            return !station.name
                ? L.DB_EMPTY_STATION(code)
                : station.name;
    }
    /**
     * Gets the given station code's vox alias, if any. A vox alias is the code of another
     * station's voice file, that the given code should use instead. This is used for
     * stations with duplicate names.
     *
     * @param code Station code to get the vox alias of
     * @returns The alias code, else the given code
     */
    getStationVox(code) {
        let station = this.stations[code];
        // Unknown station
        if (!station)
            return '???';
        // Station is just a string; assume no alias
        else if (typeof station === 'string')
            return code;
        else
            return either(station.voxAlias, code);
    }
    /**
     * Picks a random range of station codes, ensuring there are no duplicates.
     *
     * @param min Minimum amount of stations to pick
     * @param max Maximum amount of stations to pick
     * @param exclude
     * @returns A list of unique station names
     */
    pickStationCodes(min = 1, max = 16, exclude) {
        if (max - min > Object.keys(this.stations).length)
            throw Error(L.DB_TOO_MANY_STATIONS());
        let result = [];
        let length = Random.int(min, max);
        let tries = 0;
        while (result.length < length) {
            let key = Random.objectKey(this.stations);
            // Give up trying to avoid duplicates, if we try more times than there are
            // stations available. Inaccurate, but good enough.
            if (tries++ >= this.stationsCount)
                result.push(key);
            // If given an exclusion list, check against both that and results
            else if (exclude && !exclude.includes(key) && !result.includes(key))
                result.push(key);
            // If not, just check what results we've already found
            else if (!exclude && !result.includes(key))
                result.push(key);
        }
        return result;
    }
}
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Main class of the entire Rail Announcements Generator application */
class RAG {
    /**
     * Entry point for RAG, to be called from Javascript.
     *
     * @param dataRefs Configuration object, with rail data to use
     */
    static main(dataRefs) {
        window.onerror = error => RAG.panic(error);
        window.onunhandledrejection = error => RAG.panic(error);
        RAG.bootRole = dataRefs.bootRole || '';
        I18n.init();
        RAG.config = new Config(true);
        RAG.database = new Database(dataRefs);
        RAG.phraser = new Phraser();
        RAG.speech = new Speech();
        RAG.scenario = new Scenario();
        RAG.views = new Views();
        RAG.dashboard = new ScenarioDashboard();
        RAG.channel = new ScenarioChannel();
        // Register cross-window listeners on main index.html page
        RAG.registerChannelHandlers();
        // The screen role (screen.html) is a marquee-only display; set it up
        // before the welcome message so the board is ready for it.
        if (RAG.isScreenRole())
            RAG.setupDisplayRole();
        // Begin. The display board needs no click-through, so the disclaimer
        // is skipped in the screen role.
        if (!RAG.isScreenRole())
            RAG.views.disclaimer.disclaim();
        RAG.views.marquee.set(L.WELCOME);
        RAG.generate();
        // Ping dashboard if open
        RAG.channel.send('PONG', { stateJson: JSON.stringify(RAG.state) });
        // The dashboard role (index.html) is the terminal: build / manage /
        // run scenarios and edit steps in its in-page editor.
        if (RAG.isDashboardRole())
            RAG.dashboard.open();
    }
    /** True when this page booted in the dashboard (terminal) role */
    static isDashboardRole() {
        return RAG.bootRole === 'dashboard';
    }
    /** True when this page booted in the screen (display) role */
    static isScreenRole() {
        return RAG.bootRole === 'screen';
    }
    /**
     * Screen role: this page is a marquee-only display. Hide the toolbar and
     * the phrase editor so only the board is visible. Playback is driven over
     * the channel (PLAY_* / WAIT_COUNTDOWN / STOP_PLAYBACK) and never speaks
     * here, so the voice is not doubled.
     */
    static setupDisplayRole() {
        let toolbar = document.getElementById('toolbar');
        if (toolbar)
            toolbar.style.display = 'none';
        let editor = document.getElementById('editor');
        if (editor)
            editor.style.display = 'none';
    }
    /**
     * Editor role: mirror a step the dashboard is running into the marquee.
     * Display-only on purpose: the dashboard tab owns the audio, and speaking
     * here too would double the voice.
     */
    static mirrorStep(msg) {
        if (!RAG.views)
            return;
        let text = (msg && msg.text) ? String(msg.text) : '';
        if (text)
            RAG.views.marquee.set(text);
    }
    /** Register channel handlers for the main screen (index.html) */
    static registerChannelHandlers() {
        RAG.channel.on('PING', () => {
            RAG.channel.send('PONG', { stateJson: JSON.stringify(RAG.state) });
        });
        RAG.channel.on('LOAD_STEP', (msg) => {
            if (msg.stateJson) {
                RAG.load(msg.stateJson);
            }
        });
        // The dashboard tab owns playback (audio + runner); the editor only
        // mirrors the visible text, so the voice is never doubled.
        RAG.channel.on('PLAY_SINGLE_STEP', (msg) => {
            RAG.mirrorStep(msg);
        });
        RAG.channel.on('PLAY_SCENARIO_STEP', (msg) => {
            RAG.mirrorStep(msg);
        });
        RAG.channel.on('WAIT_COUNTDOWN', (msg) => {
            if (!RAG.views)
                return;
            let secs = (msg && msg.remainingSeconds !== undefined) ? msg.remainingSeconds : (msg && msg.remaining);
            if (secs === undefined)
                return;
            // setSoft: swap the text in place so the ticks don't restart the scroll every second
            RAG.views.marquee.setSoft(`Waiting ${secs}s...`);
        });
        RAG.channel.on('STOP_PLAYBACK', () => {
            if (RAG.views)
                RAG.views.marquee.set('Idle', false);
        });
        RAG.channel.on('CAPTURE_STEP_REQUEST', (msg) => {
            RAG.channel.send('CAPTURED_STEP_DATA', { nonce: msg ? msg.nonce : undefined, stateJson: JSON.stringify(RAG.state) });
            RAG.views.marquee.set('Captured step for Dashboard scenario');
        });
    }
    /** Notify external listeners (dashboard) that the current state in editor changed */
    static notifyStateChanged() {
        if (RAG.channel && RAG.state) {
            RAG.channel.send('STATE_CHANGED', { stateJson: JSON.stringify(RAG.state) });
        }
    }
    /** Generates a new random phrase and state */
    static generate() {
        RAG.state = new State();
        RAG.state.genDefaultState();
        if (RAG.views && RAG.views.editor) {
            RAG.views.editor.generate();
        }
        RAG.notifyStateChanged();
    }
    /** Loads state from given JSON */
    static load(json) {
        RAG.state = Object.assign(new State(), JSON.parse(json));
        if (RAG.views && RAG.views.editor) {
            RAG.views.editor.generate();
            RAG.views.marquee.set(L.STATE_FROM_STORAGE);
        }
        RAG.notifyStateChanged();
    }
    /** Global error handler; throws up a big red panic screen on uncaught error */
    static panic(error = "Unknown error") {
        let msg = '<div id="panicScreen" class="warningScreen">' +
            '<h1>"We are sorry to announce that..."</h1>' +
            `<p>RAG has crashed because: <code>${error}</code></p>` +
            `<p>Please open the console for more information.</p>` +
            '</div>';
        document.body.innerHTML = msg;
    }
}
/** Role this page booted in ('dashboard' / 'editor'), from the boot script */
RAG.bootRole = '';
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/** Disposable class that holds state for the current schedule, train, etc. */
class State {
    constructor() {
        /** State of collapsible elements. Key is reference ID, value is collapsed. */
        this._collapsibles = {};
        /** Current coach letter choices. Key is context ID, value is letter. */
        this._coaches = {};
        /** Current integer choices. Key is context ID, value is integer. */
        this._integers = {};
        /** Current phraseset phrase choices. Key is reference ID, value is index. */
        this._phrasesets = {};
        /** Current service choices. Key is context ID, value is service. */
        this._services = {};
        /** Current station choices. Key is context ID, value is station code. */
        this._stations = {};
        /** Current station list choices. Key is context ID, value is array of codes. */
        this._stationLists = {};
        /** Current time choices. Key is context ID, value is time. */
        this._times = {};
    }
    /**
     * Gets the currently chosen coach letter, or randomly picks one from A to Z.
     *
     * @param context Context ID to get or choose the letter for
     */
    getCoach(context) {
        if (this._coaches[context] !== undefined)
            return this._coaches[context];
        this._coaches[context] = Random.array(L.LETTERS);
        return this._coaches[context];
    }
    /**
     * Sets a coach letter.
     *
     * @param context Context ID to set the letter for
     * @param coach Value to set
     */
    setCoach(context, coach) {
        this._coaches[context] = coach;
    }
    /**
     * Gets the collapse state of a collapsible, or randomly picks one.
     *
     * @param ref Reference ID to get the collapsible state of
     * @param chance Chance between 0 and 100 of choosing true, if unset
     */
    getCollapsed(ref, chance) {
        if (this._collapsibles[ref] !== undefined)
            return this._collapsibles[ref];
        this._collapsibles[ref] = !Random.bool(chance);
        return this._collapsibles[ref];
    }
    /**
     * Sets a collapsible's state.
     *
     * @param ref Reference ID to set the collapsible state of
     * @param state Value to set, where true is "collapsed"
     */
    setCollapsed(ref, state) {
        this._collapsibles[ref] = state;
    }
    /**
     * Gets the currently chosen integer, or randomly picks one.
     *
     * @param context Context ID to get or choose the integer for
     */
    getInteger(context) {
        if (this._integers[context] !== undefined)
            return this._integers[context];
        let min = 0, max = 0;
        switch (context) {
            case "coaches":
                min = 1;
                max = 10;
                break;
            case "delayed":
                min = 5;
                max = 60;
                break;
            case "front_coaches":
                min = 2;
                max = 5;
                break;
            case "rear_coaches":
                min = 2;
                max = 5;
                break;
        }
        this._integers[context] = Random.int(min, max);
        return this._integers[context];
    }
    /**
     * Sets an integer.
     *
     * @param context Context ID to set the integer for
     * @param value Value to set
     */
    setInteger(context, value) {
        this._integers[context] = value;
    }
    /**
     * Gets the currently chosen phrase of a phraseset, or randomly picks one.
     *
     * @param ref Reference ID to get or choose the phraseset's phrase of
     */
    getPhrasesetIdx(ref) {
        let phraseset = RAG.database.getPhraseset(ref);
        let idx = this._phrasesets[ref];
        // TODO: introduce an asserts util, and start using them all over
        if (!phraseset)
            throw Error(L.STATE_BAD_PHRASESET(ref));
        // Verify index is valid, else reject and pick random
        if (idx === undefined || phraseset.children[idx] === undefined)
            this._phrasesets[ref] = Random.int(0, phraseset.children.length - 1);
        return this._phrasesets[ref];
    }
    /**
     * Sets the chosen index for a phraseset.
     *
     * @param ref Reference ID to set the phraseset index of
     * @param idx Index to set
     */
    setPhrasesetIdx(ref, idx) {
        this._phrasesets[ref] = idx;
    }
    /**
     * Gets the currently chosen service, or randomly picks one.
     *
     * @param context Context ID to get or choose the service for
     */
    getService(context) {
        if (this._services[context] !== undefined)
            return this._services[context];
        this._services[context] = RAG.database.pickService();
        return this._services[context];
    }
    /**
     * Sets a service.
     *
     * @param context Context ID to set the service for
     * @param service Value to set
     */
    setService(context, service) {
        this._services[context] = service;
    }
    /**
     * Gets the currently chosen station code, or randomly picks one.
     *
     * @param context Context ID to get or choose the station for
     */
    getStation(context) {
        if (this._stations[context] !== undefined)
            return this._stations[context];
        this._stations[context] = RAG.database.pickStationCode();
        return this._stations[context];
    }
    /**
     * Sets a station code.
     *
     * @param context Context ID to set the station code for
     * @param code Station code to set
     */
    setStation(context, code) {
        this._stations[context] = code;
    }
    /**
     * Gets the currently chosen list of station codes, or randomly generates one.
     *
     * @param context Context ID to get or choose the station list for
     */
    getStationList(context) {
        if (this._stationLists[context] !== undefined)
            return this._stationLists[context];
        else if (context === 'calling_first')
            return this.getStationList('calling');
        let min = 1, max = 16;
        switch (context) {
            case 'calling_split':
                min = 2;
                max = 16;
                break;
            case 'changes':
                min = 1;
                max = 4;
                break;
            case 'not_stopping':
                min = 1;
                max = 8;
                break;
        }
        this._stationLists[context] = RAG.database.pickStationCodes(min, max);
        return this._stationLists[context];
    }
    /**
     * Sets a list of station codes.
     *
     * @param context Context ID to set the station code list for
     * @param codes Station codes to set
     */
    setStationList(context, codes) {
        this._stationLists[context] = codes;
        if (context === 'calling_first')
            this._stationLists['calling'] = codes;
    }
    /**
     * Gets the currently chosen time
     *
     * @param context Context ID to get or choose the time for
     */
    getTime(context) {
        if (this._times[context] !== undefined)
            return this._times[context];
        this._times[context] = Strings.fromTime(Random.int(0, 23), Random.int(0, 59));
        return this._times[context];
    }
    /**
     * Sets a time.
     *
     * @param context Context ID to set the time for
     * @param time Value to set
     */
    setTime(context, time) {
        this._times[context] = time;
    }
    /** Gets the chosen excuse, or randomly picks one */
    get excuse() {
        if (this._excuse)
            return this._excuse;
        this._excuse = RAG.database.pickExcuse();
        return this._excuse;
    }
    /** Sets the current excuse */
    set excuse(value) {
        this._excuse = value;
    }
    /** Gets the chosen platform, or randomly picks one */
    get platform() {
        if (this._platform)
            return this._platform;
        let platform = ['', ''];
        // Only 2% chance for platform 0, since it's rare
        platform[0] = Random.bool(98)
            ? Random.int(1, 26).toString()
            : '0';
        // Magic values
        if (platform[0] === '9')
            platform[1] = Random.bool(25) ? '¾' : '';
        // Only 10% chance for platform letter, since it's uncommon
        if (platform[1] === '')
            platform[1] = Random.bool(10)
                ? Random.array('ABC')
                : '';
        this._platform = platform;
        return this._platform;
    }
    /** Sets the current platform */
    set platform(value) {
        this._platform = value;
    }
    /** Gets the chosen named train, or randomly picks one */
    get named() {
        if (this._named)
            return this._named;
        this._named = RAG.database.pickNamed();
        return this._named;
    }
    /** Sets the current named train */
    set named(value) {
        this._named = value;
    }
    /**
     * Sets up the state in a particular way, so that it makes some real-world sense.
     * To do so, we have to generate data in a particular order, and make sure to avoid
     * duplicates in inappropriate places and contexts.
     */
    genDefaultState() {
        // Step 1. Prepopulate station lists
        let slCalling = RAG.database.pickStationCodes(1, 16);
        let slCallSplit = RAG.database.pickStationCodes(2, 16, slCalling);
        let allCalling = [...slCalling, ...slCallSplit];
        // List of other stations found via a specific calling point
        let slChanges = RAG.database.pickStationCodes(1, 4, allCalling);
        // List of other stations that this train usually serves, but currently isn't
        let slNotStopping = RAG.database.pickStationCodes(1, 8, [...allCalling, ...slChanges]);
        // Take a random slice from the calling list, to identify as request stops
        let reqCount = Random.int(1, slCalling.length - 1);
        let slRequests = slCalling.slice(0, reqCount);
        this.setStationList('calling', slCalling);
        this.setStationList('calling_split', slCallSplit);
        this.setStationList('changes', slChanges);
        this.setStationList('not_stopping', slNotStopping);
        this.setStationList('request', slRequests);
        // Step 2. Prepopulate stations
        // Any station may be blamed for an excuse, even ones already picked
        let stExcuse = RAG.database.pickStationCode();
        // Destination is final call of the calling list
        let stDest = slCalling[slCalling.length - 1];
        // Via is a call before the destination, or one in the split list if too small
        let stVia = slCalling.length > 1
            ? Random.array(slCalling.slice(0, -1))
            : Random.array(slCallSplit.slice(0, -1));
        // Ditto for picking a random calling station as a single request or change stop
        let stCalling = slCalling.length > 1
            ? Random.array(slCalling.slice(0, -1))
            : Random.array(slCallSplit.slice(0, -1));
        // Destination (last call) of the split train's second half of the list
        let stDestSplit = slCallSplit[slCallSplit.length - 1];
        // Random non-destination stop of the split train's second half of the list
        let stViaSplit = Random.array(slCallSplit.slice(0, -1));
        // Where the train comes from, so can't be on any lists or prior stations
        let stSource = RAG.database.pickStationCode([
            ...allCalling, ...slChanges, ...slNotStopping, ...slRequests,
            stCalling, stDest, stVia, stDestSplit, stViaSplit
        ]);
        this.setStation('calling', stCalling);
        this.setStation('destination', stDest);
        this.setStation('destination_split', stDestSplit);
        this.setStation('excuse', stExcuse);
        this.setStation('source', stSource);
        this.setStation('via', stVia);
        this.setStation('via_split', stViaSplit);
        // Step 3. Prepopulate coach numbers
        let intCoaches = this.getInteger('coaches');
        // If there are enough coaches, just split the number down the middle instead.
        // Else, front and rear coaches will be randomly picked (without making sense)
        if (intCoaches >= 4) {
            let intFrontCoaches = (intCoaches / 2) | 0;
            let intRearCoaches = intCoaches - intFrontCoaches;
            this.setInteger('front_coaches', intFrontCoaches);
            this.setInteger('rear_coaches', intRearCoaches);
        }
        // If there are enough coaches, assign coach letters for contexts.
        // Else, letters will be randomly picked (without making sense)
        if (intCoaches >= 4) {
            let letters = L.LETTERS.slice(0, intCoaches).split('');
            this.setCoach('first', Random.arraySplice(letters));
            this.setCoach('shop', Random.arraySplice(letters));
            this.setCoach('standard1', Random.arraySplice(letters));
            this.setCoach('standard2', Random.arraySplice(letters));
        }
        // Step 4. Prepopulate services
        // If there is more than one service, pick one to be the "main" and one to be the
        // "alternate", else the one service will be used for both (without making sense).
        if (RAG.database.services.length > 1) {
            let services = RAG.database.services.slice();
            this.setService('provider', Random.arraySplice(services));
            this.setService('alternative', Random.arraySplice(services));
        }
        // Step 5. Prepopulate times
        // https://stackoverflow.com/a/1214753
        // The alternative time is for a train that's later than the main train
        let time = new Date(new Date().getTime() + Random.int(0, 59) * 60000);
        let timeAlt = new Date(time.getTime() + Random.int(0, 30) * 60000);
        this.setTime('main', Strings.fromTime(time));
        this.setTime('alternative', Strings.fromTime(timeAlt));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL2NvbGxhcHNlVG9nZ2xlLnRzIiwidWkvY29udHJvbHMvcGhyYXNlc2V0QnV0dG9uLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkNob29zZXIudHMiLCJ1aS9jb250cm9scy9zdGF0aW9uTGlzdEl0ZW0udHMiLCJ1aS9waWNrZXJzL3BpY2tlci50cyIsInVpL3BpY2tlcnMvY29hY2hQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2V4Y3VzZVBpY2tlci50cyIsInVpL3BpY2tlcnMvaW50ZWdlclBpY2tlci50cyIsInVpL3BpY2tlcnMvbmFtZWRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BocmFzZXNldFBpY2tlci50cyIsInVpL3BpY2tlcnMvcGxhdGZvcm1QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3NlcnZpY2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25MaXN0UGlja2VyLnRzIiwidWkvcGlja2Vycy90aW1lUGlja2VyLnRzIiwiY29uZmlnL2NvbmZpZ0Jhc2UudHMiLCJjb25maWcvY29uZmlnLnRzIiwiZGFzaGJvYXJkL2Rhc2hib2FyZC50cyIsImxhbmcvZW5nbGlzaExhbmd1YWdlLnRzIiwicGhyYXNlci9lbGVtZW50UHJvY2Vzc29ycy50cyIsInBocmFzZXIvcGhyYXNlQ29udGV4dC50cyIsInBocmFzZXIvcGhyYXNlci50cyIsInNjZW5hcmlvL3NjZW5hcmlvLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL3ZpZXdCYXNlLnRzIiwidWkvZGlzY2xhaW1lci50cyIsInVpL2VkaXRvci50cyIsInVpL21hcnF1ZWUudHMiLCJ1aS9zZXR0aW5ncy50cyIsInVpL3Rvb2xiYXIudHMiLCJ1aS92aWV3cy50cyIsInV0aWwvYXNzZXJ0cy50cyIsInV0aWwvY29sbGFwc2libGVzLnRzIiwidXRpbC9jb25kaXRpb25hbHMudHMiLCJ1dGlsL2RvbS50cyIsInV0aWwvbGlua2Rvd24udHMiLCJ1dGlsL3BhcnNlLnRzIiwidXRpbC9yYW5kb20udHMiLCJ1dGlsL3NvdW5kcy50cyIsInV0aWwvc3RyaW5ncy50cyIsInV0aWwvdHlwZXMudHMiLCJjaGFubmVsLnRzIiwiZGF0YWJhc2UudHMiLCJyYWcudHMiLCJzdGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSxzRUFBc0U7QUFFdEUsOERBQThEO0FBQzlELElBQUksQ0FBbUIsQ0FBQztBQUV4QixNQUFNLElBQUk7SUFVTiw0RUFBNEU7SUFDckUsTUFBTSxDQUFDLElBQUk7UUFFZCxJQUFJLElBQUksQ0FBQyxTQUFTO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBRW5ELElBQUksQ0FBQyxTQUFTLEdBQUc7WUFDYixJQUFJLEVBQUcsSUFBSSxlQUFlLEVBQUU7U0FDL0IsQ0FBQztRQUVGLDJCQUEyQjtRQUMzQixDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTVDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLE1BQU0sQ0FBQyxVQUFVO1FBRXJCLElBQUksSUFBa0IsQ0FBQztRQUN2QixJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsZ0JBQWdCLENBQ2hDLFFBQVEsQ0FBQyxJQUFJLEVBQ2IsVUFBVSxDQUFDLFlBQVksR0FBRyxVQUFVLENBQUMsU0FBUyxFQUM5QyxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQy9CLEtBQUssQ0FDUixDQUFD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QUssQ0FBQztRQUN6RCxJQUFJLENBQUMsT0FBTyxDQUFFLGFBQWEsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFFLENBQUM7SUFDN0QsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEdsb2JhbCByZWZlcmVuY2UgdG8gdGhlIGxhbmd1YWdlIGNvbnRhaW5lciwgc2V0IGF0IGluaXQgKi9cclxubGV0IEwgOiBFbmdsaXNoTGFuZ3VhZ2U7XHJcblxyXG5jbGFzcyBJMThuXHJcbntcclxuICAgIC8qKiBDb25zdGFudCByZWdleCB0byBtYXRjaCBmb3IgdHJhbnNsYXRpb24ga2V5cyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEFHX1JFR0VYIDogUmVnRXhwID0gLyVbQS1aX10rJS87XHJcblxyXG4gICAgLyoqIExhbmd1YWdlcyBjdXJyZW50bHkgYXZhaWxhYmxlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBsYW5ndWFnZXMgICA6IERpY3Rpb25hcnk8RW5nbGlzaExhbmd1YWdlPjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gbGFuZ3VhZ2UgY3VycmVudGx5IGluIHVzZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgY3VycmVudExhbmcgOiBFbmdsaXNoTGFuZ3VhZ2U7XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgbGFuZ3VhZ2UsIGFuZCB0cmFuc2Zvcm1zIGFsbCB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBkb2N1bWVudCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMubGFuZ3VhZ2VzKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0kxOG4gaXMgYWxyZWFkeSBpbml0aWFsaXplZCcpO1xyXG5cclxuICAgICAgICB0aGlzLmxhbmd1YWdlcyA9IHtcclxuICAgICAgICAgICAgJ2VuJyA6IG5ldyBFbmdsaXNoTGFuZ3VhZ2UoKVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExhbmd1YWdlIHNlbGVjdGlvblxyXG4gICAgICAgIEwgPSB0aGlzLmN1cnJlbnRMYW5nID0gdGhpcy5sYW5ndWFnZXNbJ2VuJ107XHJcblxyXG4gICAgICAgIEkxOG4uYXBwbHlUb0RvbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2Fsa3MgdGhyb3VnaCBhbGwgdGV4dCBub2RlcyBpbiB0aGUgRE9NLCByZXBsYWNpbmcgYW55IHRyYW5zbGF0aW9uIGtleXMuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTA3MzA3NzcvMzM1NDkyMFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBhcHBseVRvRG9tKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgOiBOb2RlIHwgbnVsbDtcclxuICAgICAgICBsZXQgd2FsayA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHksXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UIHwgTm9kZUZpbHRlci5TSE9XX1RFWFQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogSTE4bi5ub2RlRmlsdGVyIH0sXHJcbiAgICAgICAgICAgIGZhbHNlXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgd2hpbGUgKCBuZXh0ID0gd2Fsay5uZXh0Tm9kZSgpIClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBuZXh0IGFzIEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50LmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgICAgICAgICAgSTE4bi5leHBhbmRBdHRyaWJ1dGUoZWxlbWVudC5hdHRyaWJ1dGVzW2ldKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSAmJiBuZXh0LnRleHRDb250ZW50KVxyXG4gICAgICAgICAgICAgICAgSTE4bi5leHBhbmRUZXh0Tm9kZShuZXh0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbHRlcnMgdGhlIHRyZWUgd2Fsa2VyIHRvIGV4Y2x1ZGUgc2NyaXB0IGFuZCBzdHlsZSB0YWdzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhZyA9IChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAgPyAobm9kZSBhcyBFbGVtZW50KS50YWdOYW1lLnRvVXBwZXJDYXNlKClcclxuICAgICAgICAgICAgOiBub2RlLnBhcmVudEVsZW1lbnQhLnRhZ05hbWUudG9VcHBlckNhc2UoKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsnU0NSSVBUJywgJ1NUWUxFJ10uaW5jbHVkZXModGFnKVxyXG4gICAgICAgICAgICA/IE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVFxyXG4gICAgICAgICAgICA6IE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRXhwYW5kcyBhbnkgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZ2l2ZW4gYXR0cmlidXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBleHBhbmRBdHRyaWJ1dGUoYXR0cjogQXR0cikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dGluZyBhbiBhdHRyaWJ1dGUsIGV2ZW4gaWYgbm90aGluZyBhY3R1YWxseSBjaGFuZ2VzLCB3aWxsIGNhdXNlIHZhcmlvdXNcclxuICAgICAgICAvLyBzaWRlLWVmZmVjdHMgKGUuZy4gcmVsb2FkaW5nIGlmcmFtZXMpLiBTbywgYXMgd2FzdGVmdWwgYXMgdGhpcyBsb29rcywgd2UgaGF2ZVxyXG4gICAgICAgIC8vIHRvIG1hdGNoIGZpcnN0IGJlZm9yZSBhY3R1YWxseSByZXBsYWNpbmcuXHJcblxyXG4gICAgICAgIGlmICggYXR0ci52YWx1ZS5tYXRjaCh0aGlzLlRBR19SRUdFWCkgKVxyXG4gICAgICAgICAgICBhdHRyLnZhbHVlID0gYXR0ci52YWx1ZS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiB0ZXh0IG5vZGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZFRleHROb2RlKG5vZGU6IE5vZGUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSBub2RlLnRleHRDb250ZW50IS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyBrZXkgd2l0aCB2YWx1ZSBpZiBpdCBleGlzdHMsIGVsc2Uga2VlcHMgdGhlIGtleSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVwbGFjZShtYXRjaDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgICA9IG1hdGNoLnNsaWNlKDEsIC0xKTtcclxuICAgICAgICBsZXQgdmFsdWUgPSBMW2tleV0gYXMgTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAgICAgaWYgKCF2YWx1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgdHJhbnNsYXRpb24ga2V5OicsIG1hdGNoKTtcclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHJldHVybiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKVxyXG4gICAgICAgICAgICA/IHZhbHVlKClcclxuICAgICAgICAgICAgOiB2YWx1ZTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEZWxlZ2F0ZSB0eXBlIGZvciBjaG9vc2VyIHNlbGVjdCBldmVudCBoYW5kbGVycyAqL1xyXG50eXBlIFNlbGVjdERlbGVnYXRlID0gKGVudHJ5OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcclxuXHJcbi8qKiBVSSBlbGVtZW50IHdpdGggYSBmaWx0ZXJhYmxlIGFuZCBrZXlib2FyZCBuYXZpZ2FibGUgbGlzdCBvZiBjaG9pY2VzICovXHJcbmNsYXNzIENob29zZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBjaG9vc2VyIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjY2hvb3NlclRlbXBsYXRlJyk7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkb20gICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgZmlsdGVyIGlucHV0IGJveCAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0RmlsdGVyICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGNvbnRhaW5lciBvZiBpdGVtIGVsZW1lbnRzICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5wdXRDaG9pY2VzIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIE9wdGlvbmFsIGV2ZW50IGhhbmRsZXIgdG8gZmlyZSB3aGVuIGFuIGl0ZW0gaXMgc2VsZWN0ZWQgYnkgdGhlIHVzZXIgKi9cclxuICAgIHB1YmxpYyAgICBvblNlbGVjdD8gICAgIDogU2VsZWN0RGVsZWdhdGU7XHJcbiAgICAvKiogV2hldGhlciB0byB2aXN1YWxseSBzZWxlY3QgdGhlIGNsaWNrZWQgZWxlbWVudCAqL1xyXG4gICAgcHVibGljICAgIHNlbGVjdE9uQ2xpY2sgOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBpdGVtLCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBkb21TZWxlY3RlZD8gIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhdXRvLWZpbHRlciB0aW1lb3V0LCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXJUaW1lb3V0IDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBXaGV0aGVyIHRvIGdyb3VwIGFkZGVkIGVsZW1lbnRzIGJ5IGFscGhhYmV0aWNhbCBzZWN0aW9ucyAqL1xyXG4gICAgcHJvdGVjdGVkIGdyb3VwQnlBQkMgICAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogVGl0bGUgYXR0cmlidXRlIHRvIGFwcGx5IHRvIGV2ZXJ5IGl0ZW0gYWRkZWQgKi9cclxuICAgIHByb3RlY3RlZCBpdGVtVGl0bGUgICAgIDogc3RyaW5nID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGl0ZW0nO1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGEgY2hvb3NlciwgYnkgcmVwbGFjaW5nIHRoZSBwbGFjZWhvbGRlciBpbiBhIGdpdmVuIHBhcmVudCAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFDaG9vc2VyLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBDaG9vc2VyLmluaXQoKTtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldCAgICAgID0gRE9NLnJlcXVpcmUoJ2Nob29zZXInLCBwYXJlbnQpO1xyXG4gICAgICAgIGxldCBwbGFjZWhvbGRlciA9IERPTS5nZXRBdHRyKHRhcmdldCwgJ3BsYWNlaG9sZGVyJywgTC5QX0dFTkVSSUNfUEgpO1xyXG4gICAgICAgIGxldCB0aXRsZSAgICAgICA9IERPTS5nZXRBdHRyKHRhcmdldCwgJ3RpdGxlJywgTC5QX0dFTkVSSUNfVCk7XHJcbiAgICAgICAgdGhpcy5pdGVtVGl0bGUgID0gRE9NLmdldEF0dHIodGFyZ2V0LCAnaXRlbVRpdGxlJywgdGhpcy5pdGVtVGl0bGUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdXBCeUFCQyA9IHRhcmdldC5oYXNBdHRyaWJ1dGUoJ2dyb3VwQnlBQkMnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICAgPSBDaG9vc2VyLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyICA9IERPTS5yZXF1aXJlKCcuY2hTZWFyY2hCb3gnLCAgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzID0gRE9NLnJlcXVpcmUoJy5jaENob2ljZXNCb3gnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnRpdGxlICAgICAgPSB0aXRsZTtcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XHJcbiAgICAgICAgLy8gVE9ETzogUmV1c2luZyB0aGUgcGxhY2Vob2xkZXIgYXMgdGl0bGUgaXMgcHJvYmFibHkgYmFkXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9sYWtlbi5uZXQvYmxvZy9tb3N0LWNvbW1vbi1hMTF5LW1pc3Rha2VzL1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIudGl0bGUgICAgICAgPSBwbGFjZWhvbGRlcjtcclxuXHJcbiAgICAgICAgdGFyZ2V0Lmluc2VydEFkamFjZW50RWxlbWVudCgnYmVmb3JlYmVnaW4nLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGFyZ2V0LnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkcyB0aGUgZ2l2ZW4gdmFsdWUgdG8gdGhlIGNob29zZXIgYXMgYSBzZWxlY3RhYmxlIGl0ZW0uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHZhbHVlIFRleHQgb2YgdGhlIHNlbGVjdGFibGUgaXRlbVxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBXaGV0aGVyIHRvIHNlbGVjdCB0aGlzIGl0ZW0gb25jZSBhZGRlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWRkKHZhbHVlOiBzdHJpbmcsIHNlbGVjdDogYm9vbGVhbiA9IGZhbHNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcblxyXG4gICAgICAgIGl0ZW0uaW5uZXJUZXh0ID0gdmFsdWU7XHJcblxyXG4gICAgICAgIHRoaXMuYWRkUmF3KGl0ZW0sIHNlbGVjdCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIHRoZSBnaXZlbiBlbGVtZW50IHRvIHRoZSBjaG9vc2VyIGFzIGEgc2VsZWN0YWJsZSBpdGVtLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpdGVtIEVsZW1lbnQgdG8gYWRkIHRvIHRoZSBjaG9vc2VyXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFdoZXRoZXIgdG8gc2VsZWN0IHRoaXMgaXRlbSBvbmNlIGFkZGVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGRSYXcoaXRlbTogSFRNTEVsZW1lbnQsIHNlbGVjdDogYm9vbGVhbiA9IGZhbHNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpdGVtLnRpdGxlICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICAgICAgaXRlbS50YWJJbmRleCA9IC0xO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5hcHBlbmRDaGlsZChpdGVtKTtcclxuXHJcbiAgICAgICAgaWYgKHNlbGVjdClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGl0ZW0pO1xyXG4gICAgICAgICAgICBpdGVtLmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhcnMgYWxsIGl0ZW1zIGZyb20gdGhpcyBjaG9vc2VyIGFuZCB0aGUgY3VycmVudCBmaWx0ZXIgKi9cclxuICAgIHB1YmxpYyBjbGVhcigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIudmFsdWUgICAgICA9ICcnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZWxlY3QgYW5kIGZvY3VzIHRoZSBlbnRyeSB0aGF0IG1hdGNoZXMgdGhlIGdpdmVuIHZhbHVlICovXHJcbiAgICBwdWJsaWMgcHJlc2VsZWN0KHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGtleSBpbiB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBpdGVtID0gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW5ba2V5XSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gaXRlbS5pbm5lclRleHQpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgaXRlbS5mb2N1cygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHB1YmxpYyBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFyZ2V0ID0gZXYudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIHRoaXMuaXNDaG9pY2UodGFyZ2V0KSApXHJcbiAgICAgICAgaWYgKCAhdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnZGlzYWJsZWQnKSApXHJcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0KHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xvc2UgbWV0aG9kcywgZG9pbmcgYW55IHRpbWVyIGNsZWFudXAgKi9cclxuICAgIHB1YmxpYyBvbkNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGlucHV0IGV2ZW50cywgZm9yIGZpbHRlcmluZyBhbmQgbmF2aWdhdGlvbiAqL1xyXG4gICAgcHVibGljIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgICAgID0gZXYua2V5O1xyXG4gICAgICAgIGxldCBmb2N1c2VkID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZvY3VzZWQucGFyZW50RWxlbWVudCE7XHJcblxyXG4gICAgICAgIGlmICghZm9jdXNlZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBPbmx5IGhhbmRsZSBldmVudHMgb24gdGhpcyBjaG9vc2VyJ3MgY29udHJvbHNcclxuICAgICAgICBpZiAoICF0aGlzLm93bnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSB0eXBpbmcgaW50byBmaWx0ZXIgYm94XHJcbiAgICAgICAgaWYgKGZvY3VzZWQgPT09IHRoaXMuaW5wdXRGaWx0ZXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmZpbHRlclRpbWVvdXQgPSB3aW5kb3cuc2V0VGltZW91dChfID0+IHRoaXMuZmlsdGVyKCksIDUwMCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlZGlyZWN0IHR5cGluZyB0byBpbnB1dCBmaWx0ZXIgYm94XHJcbiAgICAgICAgaWYgKGZvY3VzZWQgIT09IHRoaXMuaW5wdXRGaWx0ZXIpXHJcbiAgICAgICAgaWYgKGtleS5sZW5ndGggPT09IDEgfHwga2V5ID09PSAnQmFja3NwYWNlJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaW5wdXRGaWx0ZXIuZm9jdXMoKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHByZXNzaW5nIEVOVEVSIGFmdGVyIGtleWJvYXJkIG5hdmlnYXRpbmcgdG8gYW4gaXRlbVxyXG4gICAgICAgIGlmICggdGhpcy5pc0Nob2ljZShmb2N1c2VkKSApXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0VudGVyJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KGZvY3VzZWQpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgbmF2aWdhdGlvbiB3aGVuIGNvbnRhaW5lciBvciBpdGVtIGlzIGZvY3VzZWRcclxuICAgICAgICBpZiAoa2V5ID09PSAnQXJyb3dMZWZ0JyB8fCBrZXkgPT09ICdBcnJvd1JpZ2h0JylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBkaXIgPSAoa2V5ID09PSAnQXJyb3dMZWZ0JykgPyAtMSA6IDE7XHJcbiAgICAgICAgICAgIGxldCBuYXYgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgaWYgdXNpbmcgZ3JvdXBzXHJcbiAgICAgICAgICAgIGlmICAgICAgKCB0aGlzLmdyb3VwQnlBQkMgJiYgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnZ3JvdXAnKSApXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIGlmIGNob2ljZXMgYXJlIGZsYXRcclxuICAgICAgICAgICAgZWxzZSBpZiAoIXRoaXMuZ3JvdXBCeUFCQyAmJiBmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRDaG9pY2VzKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBlbHNlIGlmIChmb2N1c2VkID09PSB0aGlzLmRvbVNlbGVjdGVkKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKHRoaXMuZG9tU2VsZWN0ZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxldmFudCB0byBiZWdpbm5pbmcgb3IgZW5kIG9mIGNvbnRhaW5lclxyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPT09IC0xKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmxhc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAobmF2KSBuYXYuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2Vycycgc3VibWl0IGV2ZW50cywgZm9yIGluc3RhbnQgZmlsdGVyaW5nICovXHJcbiAgICBwdWJsaWMgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhpZGUgb3Igc2hvdyBjaG9pY2VzIGlmIHRoZXkgcGFydGlhbGx5IG1hdGNoIHRoZSB1c2VyIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgZmlsdGVyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG5cclxuICAgICAgICBsZXQgZmlsdGVyID0gdGhpcy5pbnB1dEZpbHRlci52YWx1ZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGxldCBpdGVtcyAgPSB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbjtcclxuICAgICAgICBsZXQgZW5naW5lID0gdGhpcy5ncm91cEJ5QUJDXHJcbiAgICAgICAgICAgID8gQ2hvb3Nlci5maWx0ZXJHcm91cFxyXG4gICAgICAgICAgICA6IENob29zZXIuZmlsdGVySXRlbTtcclxuXHJcbiAgICAgICAgLy8gUHJldmVudCBicm93c2VyIHJlZHJhdy9yZWZsb3cgZHVyaW5nIGZpbHRlcmluZ1xyXG4gICAgICAgIC8vIFRPRE86IE1pZ2h0IHRoZSB1c2Ugb2YgaGlkZGVuIGJyZWFrIEExMXkgaGVyZT8gKGUuZy4gZGVmb2N1cylcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5oaWRkZW4gPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggYWxsIHRoZSBpdGVtc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIGVuZ2luZShpdGVtc1tpXSBhcyBIVE1MRWxlbWVudCwgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFwcGxpZXMgZmlsdGVyIHRvIGFuIGl0ZW0sIHNob3dpbmcgaXQgaWYgbWF0Y2hlZCwgaGlkaW5nIGlmIG5vdCAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBmaWx0ZXJJdGVtKGl0ZW06IEhUTUxFbGVtZW50LCBmaWx0ZXI6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICAvLyBTaG93IGlmIGNvbnRhaW5zIHNlYXJjaCB0ZXJtXHJcbiAgICAgICAgaWYgKGl0ZW0uaW5uZXJUZXh0LnRvTG93ZXJDYXNlKCkuaW5kZXhPZihmaWx0ZXIpID49IDApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpdGVtLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhpZGUgaWYgbm90XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaXRlbS5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFwcGxpZXMgZmlsdGVyIHRvIGNoaWxkcmVuIG9mIGEgZ3JvdXAsIGhpZGluZyB0aGUgZ3JvdXAgaWYgYWxsIGNoaWxkcmVuIGhpZGUgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVyR3JvdXAoZ3JvdXA6IEhUTUxFbGVtZW50LCBmaWx0ZXI6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJpZXMgPSBncm91cC5jaGlsZHJlbjtcclxuICAgICAgICBsZXQgY291bnQgICA9IGVudHJpZXMubGVuZ3RoIC0gMTsgLy8gLTEgZm9yIGhlYWRlciBlbGVtZW50XHJcbiAgICAgICAgbGV0IGhpZGRlbiAgPSAwO1xyXG5cclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdGF0aW9uIG5hbWUgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbi4gSGVhZGVyIHNraXBwZWQuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBlbnRyaWVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBoaWRkZW4gKz0gQ2hvb3Nlci5maWx0ZXJJdGVtKGVudHJpZXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIC8vIElmIGFsbCBzdGF0aW9uIG5hbWVzIGluIHRoaXMgbGV0dGVyIHNlY3Rpb24gd2VyZSBoaWRkZW4sIGhpZGUgdGhlIHNlY3Rpb25cclxuICAgICAgICBpZiAoaGlkZGVuID49IGNvdW50KVxyXG4gICAgICAgICAgICBncm91cC5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgZ3JvdXAuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IGNoYW5nZXMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCBhbmQgdXBkYXRlcyB0aGUgc3RhdGUgYW5kIGVkaXRvciAqL1xyXG4gICAgcHJvdGVjdGVkIHNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhbHJlYWR5U2VsZWN0ZWQgPSAoZW50cnkgPT09IHRoaXMuZG9tU2VsZWN0ZWQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zZWxlY3RPbkNsaWNrKVxyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uU2VsZWN0KVxyXG4gICAgICAgICAgICB0aGlzLm9uU2VsZWN0KGVudHJ5KTtcclxuXHJcbiAgICAgICAgaWYgKGFscmVhZHlTZWxlY3RlZClcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZCAgICAgICAgICA9IGVudHJ5O1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSA1MDtcclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ3NlbGVjdGVkJywgJ3RydWUnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgdW5zZWxlY3RzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgdmlzdWFsVW5zZWxlY3QoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC5yZW1vdmVBdHRyaWJ1dGUoJ3NlbGVjdGVkJyk7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXaGV0aGVyIHRoaXMgY2hvb3NlciBpcyBhbiBhbmNlc3RvciAob3duZXIpIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWxlbWVudCB0byBjaGVjayBpZiB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3Igb2ZcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG93bnModGFyZ2V0OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmNvbnRhaW5zKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGdpdmVuIGVsZW1lbnQgaXMgYSBjaG9vc2FibGUgb25lIG93bmVkIGJ5IHRoaXMgY2hvb3NlciAqL1xyXG4gICAgcHJvdGVjdGVkIGlzQ2hvaWNlKHRhcmdldD86IEhUTUxFbGVtZW50KSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGFyZ2V0ICE9PSB1bmRlZmluZWRcclxuICAgICAgICAgICAgJiYgdGFyZ2V0LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2RkJ1xyXG4gICAgICAgICAgICAmJiB0aGlzLm93bnModGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVSSBlbGVtZW50IGZvciB0b2dnbGluZyB0aGUgc3RhdGUgb2YgY29sbGFwc2libGUgZWRpdG9yIGVsZW1lbnRzICovXHJcbmNsYXNzIENvbGxhcHNlVG9nZ2xlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHRvZ2dsZSBidXR0b24gRE9NIHRlbXBsYXRlIHRvIGNsb25lICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNjb2xsYXBzaWJsZUJ1dHRvblRlbXBsYXRlJyk7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGF0dGFjaGVzIHRvZ2dsZSBlbGVtZW50IGZvciB0b2dnbGluZyBjb2xsYXBzaWJsZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY3JlYXRlQW5kQXR0YWNoKHBhcmVudDogRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2tpcCBpZiBhIHRvZ2dsZSBpcyBhbHJlYWR5IGF0dGFjaGVkXHJcbiAgICAgICAgaWYgKCBwYXJlbnQucXVlcnlTZWxlY3RvcignLnRvZ2dsZScpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoIUNvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5pbml0KCk7XHJcblxyXG4gICAgICAgIHBhcmVudC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2FmdGVyYmVnaW4nLFxyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgRWxlbWVudFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGdpdmVuIGNvbGxhcHNlIHRvZ2dsZSdzIHRpdGxlIHRleHQsIGRlcGVuZGluZyBvbiBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB1cGRhdGUoc3BhbjogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBzcGFuLmRhdGFzZXRbJ3JlZiddIHx8ICc/Pz8nO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBzcGFuLmRhdGFzZXRbJ3R5cGUnXSE7XHJcbiAgICAgICAgbGV0IHN0YXRlICA9IHNwYW4uaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuICAgICAgICBsZXQgdG9nZ2xlID0gRE9NLnJlcXVpcmUoJy50b2dnbGUnLCBzcGFuKTtcclxuXHJcbiAgICAgICAgdG9nZ2xlLnRpdGxlID0gc3RhdGVcclxuICAgICAgICAgICAgPyBMLlRJVExFX09QVF9PUEVOKHR5cGUsIHJlZilcclxuICAgICAgICAgICAgOiBMLlRJVExFX09QVF9DTE9TRSh0eXBlLCByZWYpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFVJIGVsZW1lbnQgZm9yIG9wZW5pbmcgdGhlIHBpY2tlciBmb3IgcGhyYXNlc2V0IGVkaXRvciBlbGVtZW50cyAqL1xyXG5jbGFzcyBQaHJhc2VzZXRCdXR0b25cclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlc2V0IGJ1dHRvbiBET00gdGVtcGxhdGUgdG8gY2xvbmUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiBUaGlzIGlzIGJlaW5nIGR1cGxpY2F0ZWQgaW4gdmFyaW91cyBwbGFjZXM7IERSWSB3aXRoIHN1Z2FyIG1ldGhvZFxyXG4gICAgICAgIFBocmFzZXNldEJ1dHRvbi5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI3BocmFzZXNldEJ1dHRvblRlbXBsYXRlJyk7XHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLmlkICAgICA9ICcnO1xyXG4gICAgICAgIFBocmFzZXNldEJ1dHRvbi5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGF0dGFjaGVzIGEgYnV0dG9uIGZvciB0aGUgZ2l2ZW4gcGhyYXNlc2V0IGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY3JlYXRlQW5kQXR0YWNoKHBocmFzZXNldDogRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2tpcCBpZiBhIGJ1dHRvbiBpcyBhbHJlYWR5IGF0dGFjaGVkXHJcbiAgICAgICAgaWYgKCBwaHJhc2VzZXQucXVlcnlTZWxlY3RvcignLmNob29zZVBocmFzZScpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoIVBocmFzZXNldEJ1dHRvbi5URU1QTEFURSlcclxuICAgICAgICAgICAgUGhyYXNlc2V0QnV0dG9uLmluaXQoKTtcclxuXHJcbiAgICAgICAgbGV0IHJlZiAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBocmFzZXNldCBhcyBIVE1MRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBidXR0b24gICA9IFBocmFzZXNldEJ1dHRvbi5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgYnV0dG9uLnRpdGxlID0gTC5USVRMRV9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgcGhyYXNlc2V0Lmluc2VydEFkamFjZW50RWxlbWVudCgnYWZ0ZXJiZWdpbicsIGJ1dHRvbik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy88cmVmZXJlbmNlIHBhdGg9XCJjaG9vc2VyLnRzXCIvPlxyXG5cclxuLy8gVE9ETzogU2VhcmNoIGJ5IHN0YXRpb24gY29kZVxyXG5cclxuLyoqXHJcbiAqIFNpbmdsZXRvbiBpbnN0YW5jZSBvZiB0aGUgc3RhdGlvbiBwaWNrZXIuIFNpbmNlIHRoZXJlIGFyZSBleHBlY3RlZCB0byBiZSAyNTAwK1xyXG4gKiBzdGF0aW9ucywgdGhpcyBlbGVtZW50IHdvdWxkIHRha2UgdXAgYSBsb3Qgb2YgbWVtb3J5IGFuZCBnZW5lcmF0ZSBhIGxvdCBvZiBET00uIFNvLCBpdFxyXG4gKiBoYXMgdG8gYmUgXCJzd2FwcGVkXCIgYmV0d2VlbiBwaWNrZXJzIGFuZCB2aWV3cyB0aGF0IHdhbnQgdG8gdXNlIGl0LlxyXG4gKi9cclxuY2xhc3MgU3RhdGlvbkNob29zZXIgZXh0ZW5kcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBTaG9ydGN1dCByZWZlcmVuY2VzIHRvIGFsbCB0aGUgZ2VuZXJhdGVkIEEtWiBzdGF0aW9uIGxpc3QgZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3RhdGlvbnMgOiBEaWN0aW9uYXJ5PEhUTUxETGlzdEVsZW1lbnQ+ID0ge307XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIocGFyZW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGFiSW5kZXggPSAwO1xyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZXMgdGhlIGxpc3Qgb2Ygc3RhdGlvbnMgZnJvbSB0aGUgZGF0YWJhc2UuIFdlIGRvIHRoaXMgYnkgY3JlYXRpbmcgYSBkbFxyXG4gICAgICAgIC8vIGVsZW1lbnQgZm9yIGVhY2ggbGV0dGVyIG9mIHRoZSBhbHBoYWJldCwgY3JlYXRpbmcgYSBkdCBlbGVtZW50IGhlYWRlciwgYW5kIHRoZW5cclxuICAgICAgICAvLyBwb3B1bGF0aW5nIHRoZSBkbCB3aXRoIHN0YXRpb24gbmFtZSBkZCBjaGlsZHJlbi5cclxuICAgICAgICBPYmplY3Qua2V5cyhSQUcuZGF0YWJhc2Uuc3RhdGlvbnMpLmZvckVhY2goIHRoaXMuYWRkU3RhdGlvbi5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRhY2hlcyB0aGlzIGNvbnRyb2wgdG8gdGhlIGdpdmVuIHBhcmVudCBhbmQgcmVzZXRzIHNvbWUgc3RhdGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gYXR0YWNoIHRoaXMgY29udHJvbCB0b1xyXG4gICAgICogQHBhcmFtIG9uU2VsZWN0IERlbGVnYXRlIHRvIGZpcmUgd2hlbiBjaG9vc2luZyBhIHN0YXRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIGF0dGFjaChwaWNrZXI6IFBpY2tlciwgb25TZWxlY3Q6IFNlbGVjdERlbGVnYXRlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IHBpY2tlci5kb21Gb3JtO1xyXG4gICAgICAgIGxldCBjdXJyZW50ID0gdGhpcy5kb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gUmUtZW5hYmxlIGFsbCBkaXNhYmxlZCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnF1ZXJ5U2VsZWN0b3JBbGwoYGRkW2Rpc2FibGVkXWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKCB0aGlzLmVuYWJsZS5iaW5kKHRoaXMpICk7XHJcblxyXG4gICAgICAgIGlmICghY3VycmVudCB8fCBjdXJyZW50ICE9PSBwYXJlbnQpXHJcbiAgICAgICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuICAgICAgICB0aGlzLm9uU2VsZWN0ID0gb25TZWxlY3QuYmluZChwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQcmUtc2VsZWN0cyBhIHN0YXRpb24gZW50cnkgYnkgaXRzIGNvZGUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3RDb2RlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG4gICAgICAgIGVudHJ5LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEVuYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBvciBzdGF0aW9uIGVsZW1lbnQgZm9yIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGVuYWJsZShjb2RlT3JOb2RlOiBzdHJpbmcgfCBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gKHR5cGVvZiBjb2RlT3JOb2RlID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgPyB0aGlzLmdldEJ5Q29kZShjb2RlT3JOb2RlKVxyXG4gICAgICAgICAgICA6IGNvZGVPck5vZGU7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCdkaXNhYmxlZCcpO1xyXG4gICAgICAgIGVudHJ5LnRhYkluZGV4ID0gLTE7XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRGlzYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBmcm9tIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGRpc2FibGUoY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSB0aGlzLmdldEJ5Q29kZShjb2RlKTtcclxuICAgICAgICBsZXQgbmV4dCAgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZW50cnksIDEpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAnJyk7XHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlID0gJyc7XHJcblxyXG4gICAgICAgIC8vIFNoaWZ0IGZvY3VzIHRvIG5leHQgYXZhaWxhYmxlIGVsZW1lbnQsIGZvciBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKG5leHQpXHJcbiAgICAgICAgICAgIG5leHQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyBhIHN0YXRpb24ncyBjaG9pY2UgZWxlbWVudCBieSBpdHMgY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBnZXRCeUNvZGUoY29kZTogc3RyaW5nKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW5wdXRDaG9pY2VzXHJcbiAgICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKGBkZFtkYXRhLWNvZGU9JHtjb2RlfV1gKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGdpdmVuIHN0YXRpb24gY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBhZGRTdGF0aW9uKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuICAgICAgICBsZXQgbGV0dGVyICA9IHN0YXRpb25bMF07XHJcbiAgICAgICAgbGV0IGdyb3VwICAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl07XHJcblxyXG4gICAgICAgIGlmICghZ3JvdXApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaGVhZGVyICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZHQnKTtcclxuICAgICAgICAgICAgaGVhZGVyLmlubmVyVGV4dCA9IGxldHRlci50b1VwcGVyQ2FzZSgpO1xyXG4gICAgICAgICAgICBoZWFkZXIudGFiSW5kZXggID0gLTE7XHJcblxyXG4gICAgICAgICAgICBncm91cCA9IHRoaXMuZG9tU3RhdGlvbnNbbGV0dGVyXSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RsJyk7XHJcbiAgICAgICAgICAgIGdyb3VwLnRhYkluZGV4ID0gNTA7XHJcblxyXG4gICAgICAgICAgICBncm91cC5zZXRBdHRyaWJ1dGUoJ2dyb3VwJywgJycpO1xyXG4gICAgICAgICAgICBncm91cC5hcHBlbmRDaGlsZChoZWFkZXIpO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5hcHBlbmRDaGlsZChncm91cCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgZW50cnkgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG4gICAgICAgIGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSA9IGNvZGU7XHJcbiAgICAgICAgZW50cnkuaW5uZXJUZXh0ICAgICAgID0gc3RhdGlvbjtcclxuICAgICAgICBlbnRyeS50aXRsZSAgICAgICAgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCAgICAgICAgPSAtMTtcclxuXHJcbiAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoZW50cnkpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN0YXRpb24gbGlzdCBpdGVtIHRoYXQgY2FuIGJlIGRyYWdnZWQgYW5kIGRyb3BwZWQgKi9cclxuY2xhc3MgU3RhdGlvbkxpc3RJdGVtXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggaXRlbSBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjc3RhdGlvbkxpc3RJdGVtVGVtcGxhdGUnKTtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgaXRlbSdzIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBzdGF0aW9uIGxpc3QgaXRlbSwgbWVhbnQgZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSB0aGlzIGl0ZW0gZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihjb2RlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUpXHJcbiAgICAgICAgICAgIFN0YXRpb25MaXN0SXRlbS5pbml0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgICA9IFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJUZXh0ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmRhdGFzZXRbJ2NvZGUnXSA9IGNvZGU7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQmFzZSBjbGFzcyBmb3IgcGlja2VyIHZpZXdzICovXHJcbmFic3RyYWN0IGNsYXNzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb20gICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBmb3JtIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tRm9ybSAgIDogSFRNTEZvcm1FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGhlYWRlciBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tSGVhZGVyIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogR2V0cyB0aGUgbmFtZSBvZiB0aGUgWE1MIHRhZyB0aGlzIHBpY2tlciBoYW5kbGVzICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgeG1sVGFnICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBocmFzZSBlbGVtZW50IGJlaW5nIGVkaXRlZCBieSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHJvdGVjdGVkIGRvbUVkaXRpbmc/IDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgcGlja2VyIHRvIGhhbmRsZSB0aGUgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQgdHlwZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30geG1sVGFnIE5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgd2lsbCBoYW5kbGUuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3Rvcih4bWxUYWc6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgICA9IERPTS5yZXF1aXJlKGAjJHt4bWxUYWd9UGlja2VyYCk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtICAgPSBET00ucmVxdWlyZSgnZm9ybScsICAgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyID0gRE9NLnJlcXVpcmUoJ2hlYWRlcicsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLnhtbFRhZyAgICA9IHhtbFRhZztcclxuXHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uY2hhbmdlICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25pbnB1dCAgID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNsaWNrICAgPSB0aGlzLm9uQ2xpY2suYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25rZXlkb3duID0gdGhpcy5vbklucHV0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uc3VibWl0ICA9IHRoaXMub25TdWJtaXQuYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIGZvcm0gZmllbGRzIGNoYW5nZS4gVGhlIGltcGxlbWVudGluZyBwaWNrZXIgc2hvdWxkIHVwZGF0ZSBhbGwgbGlua2VkXHJcbiAgICAgKiBlbGVtZW50cyAoZS5nLiBvZiBzYW1lIHR5cGUpIHdpdGggdGhlIG5ldyBkYXRhIGhlcmUuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbkNoYW5nZShldjogRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBtb3VzZSBjbGljayBoYXBwZW5zIGFueXdoZXJlIGluIG9yIG9uIHRoZSBwaWNrZXIncyBmb3JtICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiBhIGtleSBpcyBwcmVzc2VkIHdoaWxzdCB0aGUgcGlja2VyJ3MgZm9ybSBpcyBmb2N1c2VkICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIHdoZW4gRU5URVIgaXMgcHJlc3NlZCB3aGlsc3QgYSBmb3JtIGNvbnRyb2wgb2YgdGhlIHBpY2tlciBpcyBmb2N1c2VkLlxyXG4gICAgICogQnkgZGVmYXVsdCwgdGhpcyB3aWxsIHRyaWdnZXIgdGhlIG9uQ2hhbmdlIGhhbmRsZXIgYW5kIGNsb3NlIHRoZSBkaWFsb2cuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgdGhpcy5vbkNoYW5nZShldik7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3BlbiB0aGlzIHBpY2tlciBmb3IgYSBnaXZlbiBwaHJhc2UgZWxlbWVudC4gVGhlIGltcGxlbWVudGluZyBwaWNrZXIgc2hvdWxkIGZpbGxcclxuICAgICAqIGl0cyBmb3JtIGVsZW1lbnRzIHdpdGggZGF0YSBmcm9tIHRoZSBjdXJyZW50IHN0YXRlIGFuZCB0YXJnZXRlZCBlbGVtZW50IGhlcmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gdGFyZ2V0IFBocmFzZSBlbGVtZW50IHRoYXQgdGhpcyBwaWNrZXIgaXMgYmVpbmcgb3BlbmVkIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgPSB0YXJnZXQ7XHJcbiAgICAgICAgdGhpcy5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3NpdGlvbnMgdGhpcyBwaWNrZXIgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBwaHJhc2UgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIGxheW91dCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5kb21FZGl0aW5nKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXRSZWN0ID0gdGhpcy5kb21FZGl0aW5nLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGxldCBmdWxsV2lkdGggID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdmdWxsV2lkdGgnKTtcclxuICAgICAgICBsZXQgaXNNb2RhbCAgICA9IHRoaXMuZG9tLmNsYXNzTGlzdC5jb250YWlucygnbW9kYWwnKTtcclxuICAgICAgICBsZXQgZG9jVyAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGg7XHJcbiAgICAgICAgbGV0IGRvY0ggICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodDtcclxuICAgICAgICBsZXQgZGlhbG9nWCAgICA9ICh0YXJnZXRSZWN0LmxlZnQgICB8IDApIC0gODtcclxuICAgICAgICBsZXQgZGlhbG9nWSAgICA9ICB0YXJnZXRSZWN0LmJvdHRvbSB8IDA7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1cgICAgPSAodGFyZ2V0UmVjdC53aWR0aCAgfCAwKSArIDE2O1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgaG9yaXpvbnRhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBpZiAoIWZ1bGxXaWR0aCAmJiAhaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEZvcmNlIGZ1bGwgd2lkdGggb24gbW9iaWxlXHJcbiAgICAgICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoID0gYDEwMCVgO1xyXG5cclxuICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggICAgPSBgaW5pdGlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS5taW5XaWR0aCA9IGAke2RpYWxvZ1d9cHhgO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChkaWFsb2dYICsgdGhpcy5kb20ub2Zmc2V0V2lkdGggPiBkb2NXKVxyXG4gICAgICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAodGFyZ2V0UmVjdC5yaWdodCB8IDApIC0gdGhpcy5kb20ub2Zmc2V0V2lkdGggKyA4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGlja2VycyB0aGF0IGluc3RlYWQgdGFrZSB1cCB0aGUgd2hvbGUgZGlzcGxheS4gQ1NTIGlzbid0IHVzZWQgaGVyZSxcclxuICAgICAgICAvLyBiZWNhdXNlIHBlcmNlbnRhZ2UtYmFzZWQgbGVmdC90b3AgY2F1c2VzIHN1YnBpeGVsIGlzc3VlcyBvbiBDaHJvbWUuXHJcbiAgICAgICAgaWYgKGlzTW9kYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dYID0gRE9NLmlzTW9iaWxlID8gMCA6ICggKGRvY1cgKiAwLjEpIC8gMiApIHwgMDtcclxuICAgICAgICAgICAgZGlhbG9nWSA9IERPTS5pc01vYmlsZSA/IDAgOiAoIChkb2NIICogMC4xKSAvIDIgKSB8IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCB0byB0b3AgZWRnZSBvZiBkb2N1bWVudFxyXG4gICAgICAgIGVsc2UgaWYgKGRpYWxvZ1kgPCAwKVxyXG4gICAgICAgICAgICBkaWFsb2dZID0gMDtcclxuXHJcbiAgICAgICAgLy8gQWRqdXN0IGlmIHZlcnRpY2FsbHkgb2ZmIHNjcmVlblxyXG4gICAgICAgIGVsc2UgaWYgKGRpYWxvZ1kgKyB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgPiBkb2NIKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZGlhbG9nWSA9ICh0YXJnZXRSZWN0LnRvcCB8IDApIC0gdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ICsgMTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5hZGQoJ2JlbG93Jyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgc3RpbGwgb2ZmLXNjcmVlbiwgY2xhbXAgdG8gYm90dG9tXHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dZICsgdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ID4gZG9jSClcclxuICAgICAgICAgICAgICAgIGRpYWxvZ1kgPSBkb2NIIC0gdGhpcy5kb20ub2Zmc2V0SGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xhbXAgdG8gdG9wIGVkZ2Ugb2YgZG9jdW1lbnQuIExpa2VseSBoYXBwZW5zIGlmIHRhcmdldCBlbGVtZW50IGlzIGxhcmdlLlxyXG4gICAgICAgICAgICBpZiAoZGlhbG9nWSA8IDApXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dZID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5hZGQoJ2Fib3ZlJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5kb20uc3R5bGUubGVmdCA9IChmdWxsV2lkdGggPyAwIDogZGlhbG9nWCkgKyAncHgnO1xyXG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLnRvcCAgPSBkaWFsb2dZICsgJ3B4JztcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmV0dXJucyB0cnVlIGlmIGFuIGVsZW1lbnQgaW4gdGhpcyBwaWNrZXIgY3VycmVudGx5IGhhcyBmb2N1cyAqL1xyXG4gICAgcHVibGljIGhhc0ZvY3VzKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmNvbnRhaW5zKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgY29hY2ggcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBDb2FjaFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBjb2FjaCBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignY29hY2gnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMjY7IGkrKylcclxuICAgICAgICAgICAgRE9NLmFkZE9wdGlvbih0aGlzLmlucHV0TGV0dGVyLCBMLkxFVFRFUlNbaV0sIEwuTEVUVEVSU1tpXSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSB0YXJnZXQgY29udGV4dCdzIGNvYWNoIGxldHRlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0NPQUNIKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSBSQUcuc3RhdGUuZ2V0Q29hY2godGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGNvYWNoIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLnNldENvYWNoKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dExldHRlci52YWx1ZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPWNvYWNoXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGV4Y3VzZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIEV4Y3VzZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2V4Y3VzZScpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9FWENVU0U7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5leGN1c2VzLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBleGN1c2VcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgZXhjdXNlIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLmV4Y3VzZSA9IGVudHJ5LmlubmVyVGV4dDtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCgnZXhjdXNlJywgUkFHLnN0YXRlLmV4Y3VzZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBpbnRlZ2VyIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgSW50ZWdlclBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbnVtZXJpY2FsIGlucHV0IHNwaW5uZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaWdpdCA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgb3B0aW9uYWwgc3VmZml4IGxhYmVsICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUxhYmVsICAgOiBIVE1MTGFiZWxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9wdGlvbmFsIHNpbmd1bGFyIHN1ZmZpeCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgc2luZ3VsYXI/ICA6IHN0cmluZztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgcGx1cmFsIHN1ZmZpeCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgcGx1cmFsPyAgICA6IHN0cmluZztcclxuICAgIC8qKiBXaGV0aGVyIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkIHdhbnRzIHdvcmQgZGlnaXRzICovXHJcbiAgICBwcml2YXRlIHdvcmRzPyAgICAgOiBib29sZWFuO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2ludGVnZXInKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0ID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tTGFiZWwgICA9IERPTS5yZXF1aXJlKCdsYWJlbCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSB0YXJnZXQgY29udGV4dCdzIGludGVnZXIgZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuc2luZ3VsYXIgICA9IHRhcmdldC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIHRoaXMucGx1cmFsICAgICA9IHRhcmdldC5kYXRhc2V0WydwbHVyYWwnXTtcclxuICAgICAgICB0aGlzLndvcmRzICAgICAgPSBQYXJzZS5ib29sZWFuKHRhcmdldC5kYXRhc2V0Wyd3b3JkcyddIHx8ICdmYWxzZScpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcih0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICBpZiAgICAgICh0aGlzLnNpbmd1bGFyICYmIHZhbHVlID09PSAxKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMuc2luZ3VsYXI7XHJcbiAgICAgICAgZWxzZSBpZiAodGhpcy5wbHVyYWwgJiYgdmFsdWUgIT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5wbHVyYWw7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9ICcnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9JTlRFR0VSKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudEN0eCA9PT0gJ2NvYWNoZXMnKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5taW4gPSAnMCc7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5tYXggPSAnNjAnO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5yZW1vdmVBdHRyaWJ1dGUoJ21pbicpO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucmVtb3ZlQXR0cmlidXRlKCdtYXgnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnZhbHVlICAgID0gdmFsdWUudG9TdHJpbmcoKTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgaW50ZWdlciBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIENhbid0IHVzZSB2YWx1ZUFzTnVtYmVyIGR1ZSB0byBpT1MgaW5wdXQgdHlwZSB3b3JrYXJvdW5kc1xyXG4gICAgICAgIGxldCBpbnQgICAgPSBwYXJzZUludCh0aGlzLmlucHV0RGlnaXQudmFsdWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElnbm9yZSBpbnZhbGlkIHZhbHVlc1xyXG4gICAgICAgIGlmICggaXNOYU4oaW50KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudEN0eCA9PT0gJ2NvYWNoZXMnKSB7XHJcbiAgICAgICAgICAgIGlmIChpbnQgPCAwKSB7IGludCA9IDA7IHRoaXMuaW5wdXREaWdpdC52YWx1ZSA9ICcwJzsgfVxyXG4gICAgICAgICAgICBpZiAoaW50ID4gNjApIHsgaW50ID0gNjA7IHRoaXMuaW5wdXREaWdpdC52YWx1ZSA9ICc2MCc7IH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBpbnRTdHIgPSAodGhpcy53b3JkcylcclxuICAgICAgICAgICAgPyBMLkRJR0lUU1tpbnRdIHx8IGludC50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogaW50LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIGlmIChpbnQgPT09IDEgJiYgdGhpcy5zaW5ndWxhcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5zaW5ndWxhcn1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMuc2luZ3VsYXI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKGludCAhPT0gMSAmJiB0aGlzLnBsdXJhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5wbHVyYWx9YDtcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCwgaW50KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9aW50ZWdlcl1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIG5hbWVkIHRyYWluIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgTmFtZWRQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCduYW1lZCcpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9OQU1FRDtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLm5hbWVkLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIG5hbWVcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KFJBRy5zdGF0ZS5uYW1lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBuYW1lZCBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5uYW1lZCA9IGVudHJ5LmlubmVyVGV4dDtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCgnbmFtZWQnLCBSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlc2V0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGhyYXNlc2V0UGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSByZWZlcmVuY2UgdGFnIGZvciB0aGUgY3VycmVudCBwaHJhc2VzZXQgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFJlZiA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3BocmFzZXNldCcpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgcGhyYXNlc2V0J3MgbGlzdCBvZiBwaHJhc2VzICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIGxldCByZWYgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IGlkeCAgICAgICA9IHBhcnNlSW50KCBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnaWR4JykgKTtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gYXNzZXJ0KCBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZikhICk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFJlZiAgICAgICAgICA9IHJlZjtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLmNsZWFyKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIHBocmFzZSwgd2UgbmVlZCB0byBydW4gaXQgdGhyb3VnaCB0aGUgcGhyYXNlciB1c2luZyB0aGUgY3VycmVudCBzdGF0ZVxyXG4gICAgICAgIC8vIHRvIGdlbmVyYXRlIFwicHJldmlld3NcIiBvZiBob3cgdGhlIHBocmFzZSB3aWxsIGxvb2suXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGhyYXNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlc2V0LmNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50LCBwaHJhc2UpO1xyXG4gICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHBocmFzZSk7XHJcblxyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJUZXh0ICAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgICAgIHBocmFzZS5kYXRhc2V0LmlkeCA9IGkudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5hZGRSYXcocGhyYXNlLCBpID09PSBpZHgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHBocmFzZXNldCBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludChlbnRyeS5kYXRhc2V0WydpZHgnXSEpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0UGhyYXNlc2V0SWR4KHRoaXMuY3VycmVudFJlZiwgaWR4KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5yZWZyZXNoUGhyYXNlc2V0KHRoaXMuY3VycmVudFJlZik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwbGF0Zm9ybSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFBsYXRmb3JtUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0ICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGxhdGZvcm0nKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0ICAgICAgICAgID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgICAgICAgICA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUExBVEZPUk07XHJcblxyXG4gICAgICAgIC8vIGlPUyBuZWVkcyBkaWZmZXJlbnQgdHlwZSBhbmQgcGF0dGVybiB0byBzaG93IGEgbnVtZXJpY2FsIGtleWJvYXJkXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC50eXBlICAgID0gJ3RlbCc7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5wYXR0ZXJuID0gJ1swLTldKyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHBsYXRmb3JtIGRhdGEgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgbGV0IHZhbHVlID0gUkFHLnN0YXRlLnBsYXRmb3JtO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgID0gdmFsdWVbMF07XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9IHZhbHVlWzFdO1xyXG4gICAgICAgIHRoaXMudXBkYXRlTGV0dGVyVmlzaWJpbGl0eSgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBwbGF0Zm9ybSBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpbnRWYWwgPSBwYXJzZUludCh0aGlzLmlucHV0RGlnaXQudmFsdWUpO1xyXG4gICAgICAgIC8vIElnbm9yZSBpbnZhbGlkIHZhbHVlc1xyXG4gICAgICAgIGlmICggaXNOYU4oIGludFZhbCApIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoaW50VmFsIDwgMCkgeyBpbnRWYWwgPSAwOyB0aGlzLmlucHV0RGlnaXQudmFsdWUgPSAnMCc7IH1cclxuICAgICAgICBpZiAoaW50VmFsID4gNjApIHsgaW50VmFsID0gNjA7IHRoaXMuaW5wdXREaWdpdC52YWx1ZSA9ICc2MCc7IH1cclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGVMZXR0ZXJWaXNpYmlsaXR5KCk7XHJcblxyXG4gICAgICAgIC8vICdNJyAoOcK+KSBpcyBvbmx5IHZhbGlkIGZvciBwbGF0Zm9ybSA5XHJcbiAgICAgICAgaWYgKGludFZhbCAhPT0gOSAmJiB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID09PSAnTScpXHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSAnJztcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnBsYXRmb3JtID0gW3RoaXMuaW5wdXREaWdpdC52YWx1ZSwgdGhpcy5pbnB1dExldHRlci52YWx1ZV07XHJcblxyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCAncGxhdGZvcm0nLCAoUkFHLnN0YXRlLnBsYXRmb3JtWzFdID09PSAnTScpXHJcbiAgICAgICAgICAgID8gUkFHLnN0YXRlLnBsYXRmb3JtWzBdICsgJ8K+J1xyXG4gICAgICAgICAgICA6IFJBRy5zdGF0ZS5wbGF0Zm9ybS5qb2luKCcnKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIaWRlcyBhbmQgY2xlYXJzIHRoZSBsZXR0ZXIgc2VsZWN0b3IgaWYgcGxhdGZvcm0gbnVtYmVyIGlzID4gMjYgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlTGV0dGVyVmlzaWJpbGl0eSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpbnRWYWwgPSBwYXJzZUludCh0aGlzLmlucHV0RGlnaXQudmFsdWUpO1xyXG4gICAgICAgIGxldCBoaWRlICAgPSBpc05hTihpbnRWYWwpIHx8IGludFZhbCA+IDI2O1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLmhpZGRlbiAgID0gaGlkZTtcclxuICAgICAgICBpZiAoaGlkZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgICAgPSAnJztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE9ubHkgcGxhdGZvcm0gOSBoYXMgYSBcIjnCvlwiIChNKSBwcm9udW5jaWF0aW9uXHJcbiAgICAgICAgbGV0IG1PcHRpb24gPSB0aGlzLmlucHV0TGV0dGVyLnF1ZXJ5U2VsZWN0b3IoJ29wdGlvblt2YWx1ZT1cIk1cIl0nKSBhcyBIVE1MT3B0aW9uRWxlbWVudDtcclxuICAgICAgICBpZiAobU9wdGlvbilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG1PcHRpb24uaGlkZGVuICAgPSAhKGludFZhbCA9PT0gOSk7XHJcbiAgICAgICAgICAgIG1PcHRpb24uZGlzYWJsZWQgPSAhKGludFZhbCA9PT0gOSk7XHJcbiAgICAgICAgICAgIGlmIChpbnRWYWwgIT09IDkgJiYgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9PT0gJ00nKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9ICcnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzZXJ2aWNlIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU2VydmljZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgc2VydmljZSBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignc2VydmljZScpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHNlcnZpY2UgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TRVJWSUNFKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIHNlcnZpY2VcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KCBSQUcuc3RhdGUuZ2V0U2VydmljZSh0aGlzLmN1cnJlbnRDdHgpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzZXJ2aWNlIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4LCBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1zZXJ2aWNlXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IGVudHJ5LmlubmVyVGV4dCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvblBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgc2hhcmVkIHN0YXRpb24gY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGNob29zZXIgOiBTdGF0aW9uQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHN0YXRpb24gZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSBmb3IgU3RhdGlvblBpY2tlciBvciBmb3IgU3RhdGlvbkxpc3RQaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbk9wZW4gICAgIDogKHRhcmdldDogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHRhZzogc3RyaW5nID0gJ3N0YXRpb24nKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHRhZyk7XHJcblxyXG4gICAgICAgIGlmICghU3RhdGlvblBpY2tlci5jaG9vc2VyKVxyXG4gICAgICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIgPSBuZXcgU3RhdGlvbkNob29zZXIodGhpcy5kb21Gb3JtKTtcclxuXHJcbiAgICAgICAgdGhpcy5vbk9wZW4gPSB0aGlzLm9uU3RhdGlvblBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlyZXMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSByZWdpc3RlcmVkIGZvciB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG4gICAgICAgIHRoaXMub25PcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEF0dGFjaGVzIHRoZSBzdGF0aW9uIGNob29zZXIgYW5kIGZvY3VzZXMgaXQgb250byB0aGUgY3VycmVudCBlbGVtZW50J3Mgc3RhdGlvbiAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvblBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNob29zZXIgICAgID0gU3RhdGlvblBpY2tlci5jaG9vc2VyO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25TZWxlY3RTdGF0aW9uKTtcclxuICAgICAgICBjaG9vc2VyLnByZXNlbGVjdENvZGUoIFJBRy5zdGF0ZS5nZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgICAgICBjaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSB0cnVlO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIHN0YXRpb24gY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uQ2xpY2soZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uSW5wdXQoZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzdGF0aW9uIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0U3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSA9IGBbZGF0YS10eXBlPXN0YXRpb25dW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuICAgICAgICBsZXQgY29kZSAgPSBlbnRyeS5kYXRhc2V0Wydjb2RlJ10hO1xyXG4gICAgICAgIGxldCBuYW1lICA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgsIGNvZGUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gbmFtZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwic3RhdGlvblBpY2tlci50c1wiLz5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uLy4uL3ZlbmRvci9kcmFnZ2FibGUuZC50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc3RhdGlvbiBsaXN0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvbkxpc3RQaWNrZXIgZXh0ZW5kcyBTdGF0aW9uUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjb250YWluZXIgZm9yIHRoZSBsaXN0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGlzdCAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtb2JpbGUtb25seSBhZGQgc3RhdGlvbiBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQWRkICAgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtb2JpbGUtb25seSBjbG9zZSBwaWNrZXIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkNsb3NlICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZHJvcCB6b25lIGZvciBkZWxldGluZyBzdGF0aW9uIGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbURlbCAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgYWN0dWFsIHNvcnRhYmxlIGxpc3Qgb2Ygc3RhdGlvbnMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMaXN0ICAgIDogSFRNTERMaXN0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gcGxhY2Vob2xkZXIgc2hvd24gaWYgdGhlIGxpc3QgaXMgZW1wdHkgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRW1wdHlMaXN0IDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcihcInN0YXRpb25saXN0XCIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUxpc3QgICAgICA9IERPTS5yZXF1aXJlKCcuc3RhdGlvbkxpc3QnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5idG5BZGQgICAgICAgPSBET00ucmVxdWlyZSgnLmFkZFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmJ0bkNsb3NlICAgICA9IERPTS5yZXF1aXJlKCcuY2xvc2VQaWNrZXInLCB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRGVsICAgICAgID0gRE9NLnJlcXVpcmUoJy5kZWxTdGF0aW9uJywgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QgICAgPSBET00ucmVxdWlyZSgnZGwnLCAgICAgICAgICAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdCA9IERPTS5yZXF1aXJlKCdwJywgICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMub25PcGVuICAgICAgID0gdGhpcy5vblN0YXRpb25MaXN0UGlja2VyT3Blbi5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBuZXcgRHJhZ2dhYmxlLlNvcnRhYmxlKFt0aGlzLmlucHV0TGlzdCwgdGhpcy5kb21EZWxdLCB7IGRyYWdnYWJsZTogJ2RkJyB9KVxyXG4gICAgICAgICAgICAvLyBIYXZlIHRvIHVzZSB0aW1lb3V0LCB0byBsZXQgRHJhZ2dhYmxlIGZpbmlzaCBzb3J0aW5nIHRoZSBsaXN0XHJcbiAgICAgICAgICAgIC5vbiggJ2RyYWc6c3RvcCcsIGV2ID0+IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5vbkRyYWdTdG9wKGV2KSwgMSkgKVxyXG4gICAgICAgICAgICAub24oICdtaXJyb3I6Y3JlYXRlJywgdGhpcy5vbkRyYWdNaXJyb3JDcmVhdGUuYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUG9wdWxhdGVzIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciwgd2l0aCB0aGUgc2VsZWN0ZWQgbGlzdC4gQmVjYXVzZSB0aGlzIHBpY2tlclxyXG4gICAgICogZXh0ZW5kcyBmcm9tIFN0YXRpb25MaXN0LCB0aGlzIGhhbmRsZXIgb3ZlcnJpZGVzIHRoZSAnb25PcGVuJyBkZWxlZ2F0ZSBwcm9wZXJ0eVxyXG4gICAgICogb2YgU3RhdGlvbkxpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBTdGF0aW9uIGxpc3QgZWRpdG9yIGVsZW1lbnQgdG8gb3BlbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNpbmNlIHdlIHNoYXJlIHRoZSBzdGF0aW9uIHBpY2tlciB3aXRoIFN0YXRpb25MaXN0LCBncmFiIGl0XHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmF0dGFjaCh0aGlzLCB0aGlzLm9uQWRkU3RhdGlvbik7XHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgZW50cmllcyAgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbkxpc3QodGhpcy5jdXJyZW50Q3R4KS5zbGljZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OTElTVCh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgYWxsIG9sZCBsaXN0IGVsZW1lbnRzXHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuaW5uZXJIVE1MID0gJyc7XHJcblxyXG4gICAgICAgIC8vIEZpbmFsbHksIHBvcHVsYXRlIGxpc3QgZnJvbSB0aGUgY2xpY2tlZCBzdGF0aW9uIGxpc3QgZWxlbWVudFxyXG4gICAgICAgIGVudHJpZXMuZm9yRWFjaCggdiA9PiB0aGlzLmFkZCh2KSApO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZCB7IHN1cGVyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsaWNrIGV2ZW50cywgZm9yIGNob29zaW5nIGl0ZW1zICovXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub25DbGljayhldik7XHJcblxyXG4gICAgICAgIGlmIChldi50YXJnZXQgPT09IHRoaXMuYnRuQ2xvc2UpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICAvLyBGb3IgbW9iaWxlIHVzZXJzLCBzd2l0Y2ggdG8gc3RhdGlvbiBjaG9vc2VyIHNjcmVlbiBpZiBcIkFkZC4uLlwiIHdhcyBjbGlja2VkXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5BZGQpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5hZGQoJ2FkZGluZ1N0YXRpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBrZXlib2FyZCBuYXZpZ2F0aW9uIGZvciB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbklucHV0KGV2KTtcclxuXHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBldi5rZXk7XHJcbiAgICAgICAgbGV0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBPbmx5IGhhbmRsZSB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIgY29udHJvbFxyXG4gICAgICAgIGlmICggIWZvY3VzZWQgfHwgIXRoaXMuaW5wdXRMaXN0LmNvbnRhaW5zKGZvY3VzZWQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUga2V5Ym9hcmQgbmF2aWdhdGlvblxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd0xlZnQnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGRpciA9IChrZXkgPT09ICdBcnJvd0xlZnQnKSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IG5hdiA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBmb2N1c2VkIGVsZW1lbnRcclxuICAgICAgICAgICAgaWYgKGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dExpc3QpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGV2YW50IHRvIGJlZ2lubmluZyBvciBlbmQgb2YgY29udGFpbmVyXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA9PT0gLTEpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQubGFzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChuYXYpIG5hdi5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVudHJ5IGRlbGV0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0RlbGV0ZScgfHwga2V5ID09PSAnQmFja3NwYWNlJylcclxuICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEZvY3VzIG9uIG5leHQgZWxlbWVudCBvciBwYXJlbnQgb24gZGVsZXRlXHJcbiAgICAgICAgICAgIGxldCBuZXh0ID0gZm9jdXNlZC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgZm9jdXNlZC5uZXh0RWxlbWVudFNpYmxpbmcgICAgIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgdGhpcy5pbnB1dExpc3Q7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZShmb2N1c2VkKTtcclxuICAgICAgICAgICAgbmV4dC5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlciBmb3Igd2hlbiBhIHN0YXRpb24gaXMgY2hvc2VuICovXHJcbiAgICBwcml2YXRlIG9uQWRkU3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXdFbnRyeSA9IHRoaXMuYWRkKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG5cclxuICAgICAgICAvLyBTd2l0Y2ggYmFjayB0byBidWlsZGVyIHNjcmVlbiwgaWYgb24gbW9iaWxlXHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LnJlbW92ZSgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlKCk7XHJcblxyXG4gICAgICAgIC8vIEZvY3VzIG9ubHkgaWYgb24gbW9iaWxlLCBzaW5jZSB0aGUgc3RhdGlvbiBsaXN0IGlzIG9uIGEgZGVkaWNhdGVkIHNjcmVlblxyXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgICAgIG5ld0VudHJ5LmRvbS5mb2N1cygpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLnNjcm9sbEludG9WaWV3KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpeGVzIG1pcnJvcnMgbm90IGhhdmluZyBjb3JyZWN0IHdpZHRoIG9mIHRoZSBzb3VyY2UgZWxlbWVudCwgb24gY3JlYXRlICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ01pcnJvckNyZWF0ZShldjogRHJhZ2dhYmxlLkRyYWdFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYuZGF0YS5zb3VyY2UhLnN0eWxlLndpZHRoID0gZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSEuY2xpZW50V2lkdGggKyAncHgnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGRyYWdnYWJsZSBzdGF0aW9uIG5hbWUgYmVpbmcgZHJvcHBlZCAqL1xyXG4gICAgcHJpdmF0ZSBvbkRyYWdTdG9wKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIWV2LmRhdGEub3JpZ2luYWxTb3VyY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKGV2LmRhdGEub3JpZ2luYWxTb3VyY2UucGFyZW50RWxlbWVudCA9PT0gdGhpcy5kb21EZWwpXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGV2LmRhdGEub3JpZ2luYWxTb3VyY2UpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGFkZHMgYSBuZXcgZW50cnkgZm9yIHRoZSBidWlsZGVyIGxpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBjcmVhdGUgYW4gaXRlbSBmb3JcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhZGQoY29kZTogc3RyaW5nKSA6IFN0YXRpb25MaXN0SXRlbVxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXdFbnRyeSA9IG5ldyBTdGF0aW9uTGlzdEl0ZW0oY29kZSk7XHJcblxyXG4gICAgICAgIC8vIEFkZCB0aGUgbmV3IGVudHJ5IHRvIHRoZSBzb3J0YWJsZSBsaXN0XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuYXBwZW5kQ2hpbGQobmV3RW50cnkuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdC5oaWRkZW4gPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBEaXNhYmxlIHRoZSBhZGRlZCBzdGF0aW9uIGluIHRoZSBjaG9vc2VyXHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmRpc2FibGUoY29kZSk7XHJcblxyXG4gICAgICAgIC8vIERlbGV0ZSBpdGVtIG9uIGRvdWJsZSBjbGlja1xyXG4gICAgICAgIG5ld0VudHJ5LmRvbS5vbmRibGNsaWNrID0gXyA9PiB0aGlzLnJlbW92ZShuZXdFbnRyeS5kb20pO1xyXG5cclxuICAgICAgICByZXR1cm4gbmV3RW50cnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZW1vdmVzIHRoZSBnaXZlbiBzdGF0aW9uIGVudHJ5IGVsZW1lbnQgZnJvbSB0aGUgYnVpbGRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZW50cnkgRWxlbWVudCBvZiB0aGUgc3RhdGlvbiBlbnRyeSB0byByZW1vdmVcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZW1vdmUoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoICF0aGlzLmRvbUxpc3QuY29udGFpbnMoZW50cnkpIClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ0F0dGVtcHRlZCB0byByZW1vdmUgZW50cnkgbm90IG9uIHN0YXRpb24gbGlzdCBidWlsZGVyJyk7XHJcblxyXG4gICAgICAgIC8vIEVuYWJsZWQgdGhlIHJlbW92ZWQgc3RhdGlvbiBpbiB0aGUgY2hvb3NlclxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5lbmFibGUoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIGVudHJ5LnJlbW92ZSgpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlucHV0TGlzdC5jaGlsZHJlbi5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBzdGF0aW9uIGxpc3QgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgY2hpbGRyZW4gPSB0aGlzLmlucHV0TGlzdC5jaGlsZHJlbjtcclxuXHJcbiAgICAgICAgLy8gRG9uJ3QgdXBkYXRlIGlmIGxpc3QgaXMgZW1wdHlcclxuICAgICAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCBsaXN0ID0gW107XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZW50cnkgPSBjaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIGxpc3QucHVzaChlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCB0ZXh0TGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KGxpc3Quc2xpY2UoKSwgdGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICBsZXQgcXVlcnkgICAgPSBgW2RhdGEtdHlwZT1zdGF0aW9ubGlzdF1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbkxpc3QodGhpcy5jdXJyZW50Q3R4LCBsaXN0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkocXVlcnkpXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRleHRMaXN0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHRpbWUgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBUaW1lUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyB0aW1lIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRUaW1lOiBIVE1MSW5wdXRFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgdGltZSBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigndGltZScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZSA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyB0aW1lICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfVElNRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZS52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRUaW1lKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgdGltZSBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRUaW1lKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dFRpbWUudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT10aW1lXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQmFzZSBjbGFzcyBmb3IgY29uZmlndXJhdGlvbiBvYmplY3RzLCB0aGF0IGNhbiBzYXZlLCBsb2FkLCBhbmQgcmVzZXQgdGhlbXNlbHZlcyAqL1xyXG5hYnN0cmFjdCBjbGFzcyBDb25maWdCYXNlPFQgZXh0ZW5kcyBDb25maWdCYXNlPFQ+PlxyXG57XHJcbiAgICAvKiogbG9jYWxTdG9yYWdlIGtleSB3aGVyZSBjb25maWcgaXMgZXhwZWN0ZWQgdG8gYmUgc3RvcmVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVRUSU5HU19LRVkgOiBzdHJpbmcgPSAnc2V0dGluZ3MnO1xyXG5cclxuICAgIC8qKiBQcm90b3R5cGUgb2JqZWN0IGZvciBjcmVhdGluZyBuZXcgY29waWVzIG9mIHNlbGYgKi9cclxuICAgIHByaXZhdGUgdHlwZSA6IChuZXcgKCkgPT4gVCk7XHJcblxyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKCB0eXBlOiAobmV3ICgpID0+IFQpIClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnR5cGUgPSB0eXBlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgbG9hZHMgcnVudGltZSBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBsb2FkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHNldHRpbmdzID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKENvbmZpZ0Jhc2UuU0VUVElOR1NfS0VZKTtcclxuXHJcbiAgICAgICAgaWYgKCFzZXR0aW5ncylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjb25maWcgPSBKU09OLnBhcnNlKHNldHRpbmdzKTtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCBjb25maWcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZXJyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX0xPQURfRkFJTChlcnIubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IHNhdmVzIHRoaXMgY29uZmlndXJhdGlvbiB0byBsb2NhbFN0b3JhZ2UgKi9cclxuICAgIHB1YmxpYyBzYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oIENvbmZpZ0Jhc2UuU0VUVElOR1NfS0VZLCBKU09OLnN0cmluZ2lmeSh0aGlzKSApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZXJyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX1NBVkVfRkFJTChlcnIubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IGRlbGV0ZXMgdGhpcyBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyByZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbiggdGhpcywgbmV3IHRoaXMudHlwZSgpICk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShDb25maWdCYXNlLlNFVFRJTkdTX0tFWSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfUkVTRVRfRkFJTChlcnIubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLzxyZWZlcmVuY2UgcGF0aD1cImNvbmZpZ0Jhc2UudHNcIi8+XHJcblxyXG4vKiogSG9sZHMgcnVudGltZSBjb25maWd1cmF0aW9uIGZvciBSQUcgKi9cclxuY2xhc3MgQ29uZmlnIGV4dGVuZHMgQ29uZmlnQmFzZTxDb25maWc+XHJcbntcclxuICAgIC8qKiBJZiB1c2VyIGhhcyBjbGlja2VkIHNodWZmbGUgYXQgbGVhc3Qgb25jZSAqL1xyXG4gICAgcHVibGljIGNsaWNrZWRHZW5lcmF0ZSA6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIC8qKiBJZiB1c2VyIGhhcyByZWFkIHRoZSBkaXNjbGFpbWVyICovXHJcbiAgICBwdWJsaWMgcmVhZERpc2NsYWltZXIgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFZvbHVtZSBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljIHNwZWVjaFZvbCAgICAgICA6IG51bWJlciAgPSAxLjA7XHJcbiAgICAvKiogUGl0Y2ggZm9yIHNwZWVjaCB0byBiZSBzZXQgYXQgKi9cclxuICAgIHB1YmxpYyBzcGVlY2hQaXRjaCAgICAgOiBudW1iZXIgID0gMS4wO1xyXG4gICAgLyoqIFJhdGUgZm9yIHNwZWVjaCB0byBiZSBzZXQgYXQgKi9cclxuICAgIHB1YmxpYyBzcGVlY2hSYXRlICAgICAgOiBudW1iZXIgID0gMS4wO1xyXG4gICAgLyoqIFZPWCBrZXkgb2YgdGhlIGNoaW1lIHRvIHVzZSBwcmlvciB0byBzcGVha2luZyAqL1xyXG4gICAgcHVibGljIHZveENoaW1lICAgICAgICA6IHN0cmluZyAgPSAnJztcclxuICAgIC8qKiBSZWxhdGl2ZSBvciBhYnNvbHV0ZSBVUkwgb2YgdGhlIGN1c3RvbSBWT1ggdm9pY2UgdG8gdXNlICovXHJcbiAgICBwdWJsaWMgdm94Q3VzdG9tUGF0aCAgIDogc3RyaW5nICA9ICcnO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gdXNlIHRoZSBWT1ggZW5naW5lICovXHJcbiAgICBwdWJsaWMgdm94RW5hYmxlZCAgICAgIDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICAvKiogUmVsYXRpdmUgb3IgYWJzb2x1dGUgVVJMIG9mIHRoZSBWT1ggdm9pY2UgdG8gdXNlICovXHJcbiAgICBwdWJsaWMgdm94UGF0aCAgICAgICAgIDogc3RyaW5nICA9ICdodHRwczovL3p6ei1jcmVhdG9yLmdpdGh1Yi5pby9SQUctVk9YLVJveSc7XHJcblxyXG4gICAgLyoqIENob2ljZSBvZiBzcGVlY2ggdm9pY2UgdG8gdXNlIGFzIHZvaWNlIG5hbWUsIG9yICcnIGlmIHVuc2V0ICovXHJcbiAgICBwcml2YXRlIF9zcGVlY2hWb2ljZSA6IHN0cmluZyA9ICcnO1xyXG4gICAgLyoqIEltcHVsc2UgcmVzcG9uc2UgdG8gdXNlIGZvciBWT1gncyByZXZlcmIgKi9cclxuICAgIHByaXZhdGUgX3ZveFJldmVyYiAgIDogc3RyaW5nID0gJ2lyLnN0YWxiYW5zLndhdic7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDaG9pY2Ugb2Ygc3BlZWNoIHZvaWNlIHRvIHVzZSwgYXMgYSB2b2ljZSBuYW1lLiBCZWNhdXNlIG9mIHRoZSBhc3luYyBuYXR1cmUgb2ZcclxuICAgICAqIGdldFZvaWNlcywgdGhlIGRlZmF1bHQgdmFsdWUgd2lsbCBiZSBmZXRjaGVkIGZyb20gaXQgZWFjaCB0aW1lLlxyXG4gICAgICovXHJcbiAgICBnZXQgc3BlZWNoVm9pY2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIC8vIElmIHRoZXJlJ3MgYSB1c2VyLWRlZmluZWQgdmFsdWUsIHVzZSB0aGF0XHJcbiAgICAgICAgaWYgKHRoaXMuX3NwZWVjaFZvaWNlICE9PSAnJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NwZWVjaFZvaWNlO1xyXG5cclxuICAgICAgICAvLyBTZWxlY3QgRW5nbGlzaCB2b2ljZXMgYnkgZGVmYXVsdFxyXG4gICAgICAgIGxldCB2b2ljZXMgPSBSQUcuc3BlZWNoLmJyb3dzZXJWb2ljZXM7XHJcblxyXG4gICAgICAgIGZvciAobGV0IG5hbWUgaW4gdm9pY2VzKVxyXG4gICAgICAgIGlmICAodm9pY2VzW25hbWVdLmxhbmcgPT09ICdlbi1HQicgfHwgdm9pY2VzW25hbWVdLmxhbmcgPT09ICdlbi1VUycpXHJcbiAgICAgICAgICAgIHJldHVybiBuYW1lO1xyXG5cclxuICAgICAgICAvLyBFbHNlLCBmaXJzdCB2b2ljZSBvbiB0aGUgbGlzdFxyXG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh2b2ljZXMpWzBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjaG9pY2Ugb2Ygc3BlZWNoIHRvIHVzZSwgYXMgdm9pY2UgbmFtZSAqL1xyXG4gICAgc2V0IHNwZWVjaFZvaWNlKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3BlZWNoVm9pY2UgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgaW1wdWxzZSByZXNwb25zZSBmaWxlIHRvIHVzZSBmb3IgVk9YIGVuZ2luZSdzIHJldmVyYiAqL1xyXG4gICAgZ2V0IHZveFJldmVyYigpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUmVzZXQgY2hvaWNlIG9mIHJldmVyYiBpZiBpdCdzIGludmFsaWRcclxuICAgICAgICBsZXQgY2hvaWNlcyA9IE9iamVjdC5rZXlzKFZveEVuZ2luZS5SRVZFUkJTKTtcclxuXHJcbiAgICAgICAgaWYgKCAhY2hvaWNlcy5pbmNsdWRlcyh0aGlzLl92b3hSZXZlcmIpIClcclxuICAgICAgICAgICAgdGhpcy5fdm94UmV2ZXJiID0gY2hvaWNlc1swXTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZveFJldmVyYjtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgaW1wdWxzZSByZXNwb25zZSBmaWxlIHRvIHVzZSBmb3IgVk9YIGVuZ2luZSdzIHJldmVyYiAqL1xyXG4gICAgc2V0IHZveFJldmVyYih2YWx1ZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3ZveFJldmVyYiA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihhdXRvTG9hZDogYm9vbGVhbiA9IGZhbHNlKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKENvbmZpZyk7XHJcblxyXG4gICAgICAgIGlmIChhdXRvTG9hZClcclxuICAgICAgICAgICAgdGhpcy5sb2FkKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXG5cbmludGVyZmFjZSBEYXNoU3RlcFxue1xuICAgIHR5cGU6ICdhbm5vdW5jZW1lbnQnIHwgJ3dhaXQnO1xuICAgIHN0YXRlSnNvbj86IHN0cmluZztcbiAgICBnYXBNczogbnVtYmVyO1xuICAgIHdhaXRTZWNvbmRzPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgRGFzaFNjZW5hcmlvXG57XG4gICAgaWQ6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgc3RlcHM6IERhc2hTdGVwW107XG4gICAgbG9vcENvdW50OiBudW1iZXI7XG4gICAgY3JlYXRlZEF0OiBudW1iZXI7XG4gICAgdXBkYXRlZEF0OiBudW1iZXI7XG59XG5cbmNsYXNzIFNjZW5hcmlvRGFzaGJvYXJkXG57XG4gICAgcHJpdmF0ZSBzdG9yYWdlS2V5ID0gJ3JhZy5zY2VuYXJpb3MnO1xuICAgIHByaXZhdGUgc2NlbmFyaW9zOiBEYXNoU2NlbmFyaW9bXSA9IFtdO1xuICAgIHByaXZhdGUgY3VycmVudElkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAvKiogVHJ1ZSB3aGlsZSB0aGUgc3RlcCBlZGl0b3IgdmlldyBpcyBvcGVuIChhIHN0ZXAgaXMgYmVpbmcgZWRpdGVkKSAqL1xuICAgIHB1YmxpYyBlZGl0aW5nID0gZmFsc2U7XG4gICAgLyoqIFNlcmlhbGl6ZWQgc3RhdGUgYXMgaXQgd2FzIHdoZW4gZWRpdGluZyBiZWdhbjsgbnVsbCB3aGVuIG5vdCBlZGl0aW5nLiBEaWZmZXJzIGZyb20gdGhlIGxpdmUgc3RhdGUgd2hpbGUgdGhlIGVkaXRvciBpcyBkaXJ0eSAqL1xuICAgIHByaXZhdGUgZWRpdFNuYXBzaG90OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIHBhbmVsOiBIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIHByb2dyZXNzVGV4dEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgcHJvZ3Jlc3NGaWxsRWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gICAgLyoqIElubmVyIHNwYW4gb2YgdGhlIG5vdy1wbGF5aW5nIGxpbmUgKHRoZSBzY3JvbGwgdGFyZ2V0KSAqL1xuICAgIHByaXZhdGUgbm93UGxheWluZ1NwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gICAgLyoqIHJBRiBoYW5kbGUgb2YgdGhlIHJ1bm5pbmcgbm93LXBsYXlpbmcgc2Nyb2xsLCAwIHdoZW4gaWRsZSAqL1xuICAgIHByaXZhdGUgbm93UGxheWluZ1RpbWVyOiBudW1iZXIgPSAwO1xuICAgIC8qKiBDdXJyZW50IHggb2Zmc2V0IChweCkgb2YgdGhlIG5vdy1wbGF5aW5nIHNjcm9sbCAqL1xuICAgIHByaXZhdGUgbm93UGxheWluZ09mZnNldDogbnVtYmVyID0gMDtcblxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXG4gICAge1xuICAgICAgICB0aGlzLnBhbmVsID0gRE9NLnJlcXVpcmUoJyNzY2VuYXJpb0Rhc2hib2FyZCcpO1xuICAgICAgICB0aGlzLmxvYWRBbGwoKTtcblxuICAgICAgICAvLyBSZXN0b3JlIHRoZSBsYXN0IHNlbGVjdGVkIHNjZW5hcmlvLCBvciBkZWZhdWx0IHRvIHRoZSBmaXJzdCBvbmVcbiAgICAgICAgbGV0IHNhdmVkSWQgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgncmFnLmN1cnJlbnRTY2VuYXJpb0lkJyk7XG4gICAgICAgIGlmIChzYXZlZElkICYmIHRoaXMuc2NlbmFyaW9zLnNvbWUocyA9PiBzLmlkID09PSBzYXZlZElkKSlcbiAgICAgICAgICAgIHRoaXMuY3VycmVudElkID0gc2F2ZWRJZDtcbiAgICAgICAgZWxzZSBpZiAodGhpcy5zY2VuYXJpb3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHRoaXMuY3VycmVudElkID0gdGhpcy5zY2VuYXJpb3NbMF0uaWQ7XG5cbiAgICAgICAgUkFHLnNjZW5hcmlvLm9uU3RlcCA9IChpZHg6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVQcm9ncmVzcyhpZHgsIHRvdGFsKTtcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0U3RlcChpZHgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIFJBRy5zY2VuYXJpby5vbkNvbXBsZXRlID0gKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5vblBsYXliYWNrRW5kZWQoKTtcbiAgICAgICAgICAgIHRoaXMuc2V0Tm93UGxheWluZygnU2NlbmFyaW8gZmluaXNoZWQuJywgdHJ1ZSk7XG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ1NjZW5hcmlvIGZpbmlzaGVkLicpO1xuICAgICAgICB9O1xuXG4gICAgICAgIFJBRy5zY2VuYXJpby5vbkVycm9yID0gKG1zZzogc3RyaW5nKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLm9uUGxheWJhY2tFbmRlZCgpO1xuICAgICAgICAgICAgYWxlcnQoJ1NjZW5hcmlvIGVycm9yOiAnICsgbXNnKTtcbiAgICAgICAgICAgIHRoaXMuc2V0Tm93UGxheWluZygnU2NlbmFyaW8gc3RvcHBlZDogJyArIG1zZywgZmFsc2UpO1xuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdTY2VuYXJpbyBzdG9wcGVkOiAnICsgbXNnLCBmYWxzZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gVGhlIHBhbmVsIGNvdmVycyB0aGUgbWFpbiBzY3JlZW4sIHNvIG1pcnJvciB3aGF0IGlzIGJlaW5nXG4gICAgICAgIC8vIGFubm91bmNlZCAoYW5kIGFueSB3YWl0IGNvdW50ZG93bikgaW5zaWRlIGl0LlxuICAgICAgICBSQUcuc2NlbmFyaW8ub25UZXh0VXBkYXRlID0gKHRleHQ6IHN0cmluZykgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5zZXROb3dQbGF5aW5nKHRleHQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIFJBRy5zY2VuYXJpby5vbldhaXRDb3VudGRvd24gPSAocmVtYWluaW5nOiBudW1iZXIpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuc2V0Tm93UGxheWluZygnV2FpdGluZyAnICsgcmVtYWluaW5nICsgJ3MuLi4nKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBBbm90aGVyIHRhYiAob3IgdGhpcyB0YWIncyBvd24gdG9vbGJhcikgbWF5IGhhdmUgd3JpdHRlbiBuZXdlclxuICAgICAgICAvLyBzY2VuYXJpb3M7IHJlLXJlYWQgdGhlbSBzbyB0aGUgcGFuZWwgbmV2ZXIgY2xvYmJlcnMgdGhlbS5cbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3N0b3JhZ2UnLCAoZTogU3RvcmFnZUV2ZW50KSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdyYWcuc2NlbmFyaW9zJyB8fCBlLmtleSA9PT0gJ3JhZy5jdXJyZW50U2NlbmFyaW9JZCcpXG4gICAgICAgICAgICAgICAgdGhpcy5yZWZyZXNoKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hvd3MgdGhlIGRhc2hib2FyZCB2aWV3IOKAlCBwYW5lbCB1cCwgZWRpdG9yIGhpZGRlbi4gQ2FsbGVkIGF0IGJvb3RcbiAgICAgKiB3aGVuIHRoaXMgcGFnZSBpcyBydW5uaW5nIGluIHRoZSBkYXNoYm9hcmQgcm9sZTogdGhlIGRhc2hib2FyZCBpc1xuICAgICAqIHRoZSBkZWZhdWx0IGVudHJ5IHZpZXcsIGFuZCB0aGUgZWRpdG9yIGFwcGVhcnMgb25seSBvbiBFZGl0LlxuICAgICAqL1xuICAgIHB1YmxpYyBvcGVuKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc2hvd0Rhc2hib2FyZCgpO1xuICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE9wZW5zIHRoZSBzdGVwIGVkaXRvciB2aWV3OiBoaWRlcyB0aGUgcGFuZWwgc28gdGhlIHBocmFzZSBlZGl0b3Igb25cbiAgICAgKiB0aGlzIHNhbWUgZGFzaGJvYXJkIHBhZ2UgaXMgcmV2ZWFsZWQgd2l0aCBpdHMgdG9vbGJhci4gVGhlIHBhbmVsJ3NcbiAgICAgKiBQbGF5L1N0b3AgYXJlIHRoZSBzY2VuYXJpbyB0cmlnZ2VyczsgdGhlIHRvb2xiYXIncyBQbGF5L1N0b3Agc3BlYWtcbiAgICAgKiB0aGUgc2luZ2xlIGFubm91bmNlbWVudCBiZWluZyBlZGl0ZWQuXG4gICAgICovXG4gICAgcHVibGljIG9wZW5FZGl0KCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc2hvd0VkaXRvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsb3NlcyB0aGUgc3RlcCBlZGl0b3IgdmlldzogcmUtc2hvd3MgdGhlIGRhc2hib2FyZCBwYW5lbCBhbmRcbiAgICAgKiByZS1yZWFkcyB0aGUgc2NlbmFyaW9zIHNvIGFueXRoaW5nIHNhdmVkIGZyb20gdGhlIGVkaXRvciBpc1xuICAgICAqIHJlZmxlY3RlZC5cbiAgICAgKi9cbiAgICBwdWJsaWMgY2xvc2VFZGl0KCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc2hvd0Rhc2hib2FyZCgpO1xuICAgICAgICB0aGlzLnJlZnJlc2goKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbG9zZSByZXF1ZXN0IGZyb20gdGhlIGVkaXRvcidzIOKclSBidXR0b24gb3IgRVNDOiBjbG9zZXMgc3RyYWlnaHRcbiAgICAgKiBhd2F5IGlmIHRoZSBzdGVwIGJlaW5nIGVkaXRlZCBoYXMgbm8gdW5zYXZlZCBjaGFuZ2VzLCBhbmQgYXNrcyB0aGVcbiAgICAgKiB1c2VyIGZpcnN0IG90aGVyd2lzZSDigJQgY2xvc2luZyB3b3VsZCBkaXNjYXJkIHdoYXQgdGhleSBjaGFuZ2VkLlxuICAgICAqL1xuICAgIHB1YmxpYyByZXF1ZXN0Q2xvc2UoKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKHRoaXMuaXNEaXJ0eSgpICYmICFjb25maXJtKCdEaXNjYXJkIHVuc2F2ZWQgY2hhbmdlcz8nKSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy5jbG9zZUVkaXQoKTtcbiAgICB9XG5cbiAgICAvKiogVHJ1ZSBpZiB0aGUgYW5ub3VuY2VtZW50IGluIHRoZSBlZGl0b3IgZGlmZmVycyBmcm9tIHRoZSBzdGF0ZSB0aGUgc3RlcCBiZWluZyBlZGl0ZWQgaGVsZCB3aGVuIGl0IHdhcyBvcGVuZWQgKi9cbiAgICBwdWJsaWMgaXNEaXJ0eSgpOiBib29sZWFuXG4gICAge1xuICAgICAgICBpZiAodGhpcy5lZGl0U25hcHNob3QgPT09IG51bGwpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpICE9PSB0aGlzLmVkaXRTbmFwc2hvdDtcbiAgICB9XG5cbiAgICAvKiogU3dpdGNoZXMgdG8gdGhlIGRhc2hib2FyZCB2aWV3OiBwYW5lbCB1cCwgZWRpdG9yIGhpZGRlbiAqL1xuICAgIHByaXZhdGUgc2hvd0Rhc2hib2FyZCgpOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLmVkaXRpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5lZGl0U25hcHNob3QgPSBudWxsO1xuICAgICAgICB0aGlzLnBhbmVsLmhpZGRlbiA9IGZhbHNlO1xuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gPSB0cnVlO1xuICAgIH1cblxuICAgIC8qKiBTd2l0Y2hlcyB0byB0aGUgc3RlcCBlZGl0b3IgdmlldzogZWRpdG9yIHVwLCBwYW5lbCBoaWRkZW4gKi9cbiAgICBwcml2YXRlIHNob3dFZGl0b3IoKTogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5lZGl0aW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5wYW5lbC5oaWRkZW4gPSB0cnVlO1xuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gPSBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZS1yZWFkcyBzY2VuYXJpb3MgZnJvbSBsb2NhbFN0b3JhZ2UgYW5kIHJlLXJlbmRlcnMuIENhbGxlZCBhZnRlclxuICAgICAqIGFueXRoaW5nIHdyaXRlcyB0aGUgc2NlbmFyaW9zIG91dCBmcm9tIHVuZGVyIHRoaXMgaW5zdGFuY2UncyBpbi1cbiAgICAgKiBtZW1vcnkgY29weSAodGhlIHRvb2xiYXIncyBDYXB0dXJlL1VwZGF0ZSBTdGVwIGJ1dHRvbnMsIGFub3RoZXIgdGFiKS5cbiAgICAgKi9cbiAgICBwdWJsaWMgcmVmcmVzaCgpOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLmxvYWRBbGwoKTtcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnQoKSlcbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50SWQgPSB0aGlzLnNjZW5hcmlvcy5sZW5ndGggPiAwID8gdGhpcy5zY2VuYXJpb3NbMF0uaWQgOiBudWxsO1xuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudElkKVxuICAgICAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcuY3VycmVudFNjZW5hcmlvSWQnLCB0aGlzLmN1cnJlbnRJZCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIHRoZSBcIm5vdyBwbGF5aW5nXCIgbGluZSBpbnNpZGUgdGhlIHBhbmVsLCBzY3JvbGxpbmcgdGhlIHRleHRcbiAgICAgKiB0aHJvdWdoIGl0IGxpa2UgdGhlIG1haW4gbWFycXVlZSAodGhlIHBhbmVsIGNvdmVycyAjbWFycXVlZSwgc28gdGhpc1xuICAgICAqIGxpbmUgaXMgd2hhdCBpcyBhY3R1YWxseSB2aXNpYmxlIGR1cmluZyBwbGF5YmFjaykuIFdoaWxlIGEgc2Nyb2xsIGlzXG4gICAgICogYWxyZWFkeSBydW5uaW5nLCBuZXcgdGV4dCBzaW1wbHkgc3dhcHMgaW4gd2l0aG91dCByZXN0YXJ0aW5nLCBzbyB0aGVcbiAgICAgKiB3YWl0IGNvdW50ZG93biB0aWNrcyBzbW9vdGhseSBpbnN0ZWFkIG9mIGp1bXBpbmcgdG8gdGhlIHJpZ2h0IGVkZ2UuXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXROb3dQbGF5aW5nKHRleHQ6IHN0cmluZywgYW5pbWF0ZTogYm9vbGVhbiA9IHRydWUpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgZWwgPSB0aGlzLnBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoTm93UGxheWluZycpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKCFlbClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBsZXQgc3BhbiA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ3NwYW4nKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmICghc3BhbilcbiAgICAgICAge1xuICAgICAgICAgICAgZWwudGV4dENvbnRlbnQgPSAnJztcbiAgICAgICAgICAgIHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgICAgICBlbC5hcHBlbmRDaGlsZChzcGFuKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzcGFuICE9PSB0aGlzLm5vd1BsYXlpbmdTcGFuKVxuICAgICAgICB7XG4gICAgICAgICAgICAvLyBUaGUgcGFuZWwgd2FzIHJlLXJlbmRlcmVkIChuZXcgc3Bhbik6IGRyb3AgYW55IHJ1bm5pbmcgc2Nyb2xsXG4gICAgICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5ub3dQbGF5aW5nVGltZXIpO1xuICAgICAgICAgICAgdGhpcy5ub3dQbGF5aW5nVGltZXIgPSAwO1xuICAgICAgICAgICAgdGhpcy5ub3dQbGF5aW5nU3BhbiA9IHNwYW47XG4gICAgICAgIH1cblxuICAgICAgICBzcGFuLnRleHRDb250ZW50ID0gdGV4dDtcblxuICAgICAgICBpZiAoIWFuaW1hdGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLm5vd1BsYXlpbmdUaW1lcik7XG4gICAgICAgICAgICB0aGlzLm5vd1BsYXlpbmdUaW1lciA9IDA7XG4gICAgICAgICAgICBzcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMubm93UGxheWluZ1RpbWVyICE9PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vIFNhbWUgbWVjaGFuaWNzIGFzIE1hcnF1ZWUuc2V0OiBlbnRlciBmcm9tIHRoZSByaWdodCwgZXhpdCBsZWZ0LFxuICAgICAgICAvLyB0aGVuIHJlc3QgYXQgdGhlIGxlZnQgZWRnZVxuICAgICAgICB0aGlzLm5vd1BsYXlpbmdPZmZzZXQgPSBlbC5jbGllbnRXaWR0aDtcbiAgICAgICAgdGhpcy5ub3dQbGF5aW5nVGltZXIgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHRoaXMuc2Nyb2xsTm93UGxheWluZygpKTtcbiAgICB9XG5cbiAgICAvKiogT25lIGZyYW1lIG9mIHRoZSBub3ctcGxheWluZyBzY3JvbGwgKi9cbiAgICBwcml2YXRlIHNjcm9sbE5vd1BsYXlpbmcoKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHNwYW4gPSB0aGlzLm5vd1BsYXlpbmdTcGFuO1xuICAgICAgICBpZiAoIXNwYW4gfHwgIXNwYW4ucGFyZW50Tm9kZSlcbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5ub3dQbGF5aW5nVGltZXIgPSAwO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5ub3dQbGF5aW5nT2Zmc2V0IC09IDY7XG4gICAgICAgIHNwYW4uc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZVgoJHt0aGlzLm5vd1BsYXlpbmdPZmZzZXR9cHgpYDtcblxuICAgICAgICBsZXQgbGltaXQgPSAtc3Bhbi5jbGllbnRXaWR0aCAtIDEwMDtcbiAgICAgICAgaWYgKHRoaXMubm93UGxheWluZ09mZnNldCA8IGxpbWl0KVxuICAgICAgICB7XG4gICAgICAgICAgICAvLyBUaGUgd2hvbGUgbWVzc2FnZSBoYXMgcGFzc2VkOiBsZXQgaXQgcmVzdCBhdCB0aGUgbGVmdCBlZGdlXG4gICAgICAgICAgICBzcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuICAgICAgICAgICAgdGhpcy5ub3dQbGF5aW5nVGltZXIgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5ub3dQbGF5aW5nVGltZXIgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHRoaXMuc2Nyb2xsTm93UGxheWluZygpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZEFsbCgpOiB2b2lkXG4gICAge1xuICAgICAgICB0cnlcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKHRoaXMuc3RvcmFnZUtleSk7XG4gICAgICAgICAgICBsZXQgcGFyc2VkID0gcmF3ID8gSlNPTi5wYXJzZShyYXcpIGFzIERhc2hTY2VuYXJpb1tdIDogW107XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocGFyc2VkKSlcbiAgICAgICAgICAgICAgICBwYXJzZWQgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuc2NlbmFyaW9zID0gcGFyc2VkO1xuICAgICAgICAgICAgdGhpcy5zY2VuYXJpb3MuZm9yRWFjaChzYyA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGlmIChzYy5zdGVwcylcbiAgICAgICAgICAgICAgICAgICAgc2Muc3RlcHMuZm9yRWFjaChzdCA9PiB0aGlzLmNsZWFuU3RlcChzdCkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuc2NlbmFyaW9zID0gW107XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdHJpcHMgZmllbGRzIHRoZSBhcHAgbm8gbG9uZ2VyIHVzZXMgKGJyYW5jaGluZyBhbmQgc3RlcCBsYWJlbHMsXG4gICAgICogcmVtb3ZlZCAyMDI2LTExLTE0KSBzbyBvbGQgc2F2ZXMgYW5kIGltcG9ydHMgc3RheSBjbGVhbi5cbiAgICAgKi9cbiAgICBwcml2YXRlIGNsZWFuU3RlcChzdDogYW55KTogdm9pZFxuICAgIHtcbiAgICAgICAgZGVsZXRlIHN0LmJyYW5jaGVzO1xuICAgICAgICBkZWxldGUgc3QuYnJhbmNoO1xuICAgICAgICBkZWxldGUgc3QubGFiZWw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzYXZlQWxsKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKHRoaXMuc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkodGhpcy5zY2VuYXJpb3MpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGN1cnJlbnQoKTogRGFzaFNjZW5hcmlvIHwgbnVsbFxuICAgIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NlbmFyaW9zLmZpbmQocyA9PiBzLmlkID09PSB0aGlzLmN1cnJlbnRJZCkgfHwgbnVsbDtcbiAgICB9XG5cbiAgICAvKiogRXNjYXBlcyB1c2VyLWVudGVyZWQgdGV4dCBiZWZvcmUgaXQgaXMgaW50ZXJwb2xhdGVkIGludG8gSFRNTCAqL1xuICAgIHByaXZhdGUgZXNjKHY6IHN0cmluZyk6IHN0cmluZ1xuICAgIHtcbiAgICAgICAgcmV0dXJuIHYucmVwbGFjZSgvJi9nLCAnJmFtcDsnKS5yZXBsYWNlKC88L2csICcmbHQ7JykucmVwbGFjZSgvPi9nLCAnJmd0OycpLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcbiAgICB9XG5cbiAgICAvLyDilIDilIAgUGxheWJhY2sg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBwcml2YXRlIHN0YXJ0UGxheWJhY2soKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgaWYgKCFzIHx8IHMuc3RlcHMubGVuZ3RoID09PSAwKVxuICAgICAgICB7XG4gICAgICAgICAgICBhbGVydCgnVGhpcyBzY2VuYXJpbyBoYXMgbm8gc3RlcHMgeWV0LiBDYXB0dXJlIG9yIGFkZCBzb21lIGZpcnN0LicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXRFZGl0aW5nRW5hYmxlZChmYWxzZSk7XG5cbiAgICAgICAgUkFHLnNjZW5hcmlvLmNsZWFyKCk7XG4gICAgICAgIFJBRy5zY2VuYXJpby5zZXRTdGVwcyhzLnN0ZXBzIGFzIGFueSk7XG4gICAgICAgIFJBRy5zY2VuYXJpby5zZXRMb29wQ291bnQocy5sb29wQ291bnQpO1xuICAgICAgICBSQUcuc2NlbmFyaW8ucGxheSgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3RvcFBsYXliYWNrKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIFJBRy5zY2VuYXJpby5zdG9wKCk7XG4gICAgICAgIHRoaXMub25QbGF5YmFja0VuZGVkKCk7XG4gICAgICAgIHRoaXMuc2V0Tm93UGxheWluZygnUGxheWJhY2sgc3RvcHBlZC4nLCBmYWxzZSk7XG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCgnUGxheWJhY2sgc3RvcHBlZC4nKTtcbiAgICB9XG5cbiAgICAvKiogUGxheXMgYSBzaW5nbGUgc3RlcCBvbmNlIChhbm5vdW5jZW1lbnQgb3Igd2FpdCksIHRoZW4gc3RvcHMgKi9cbiAgICBwcml2YXRlIHBsYXlTdGVwT25seShpZHg6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgIGlmICghcyB8fCAhcy5zdGVwc1tpZHhdKVxuICAgICAgICB7XG4gICAgICAgICAgICBhbGVydCgnVGhpcyBzY2VuYXJpbyBoYXMgbm8gc3RlcHMgeWV0LiBDYXB0dXJlIG9yIGFkZCBzb21lIGZpcnN0LicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXRFZGl0aW5nRW5hYmxlZChmYWxzZSk7XG5cbiAgICAgICAgUkFHLnNjZW5hcmlvLmNsZWFyKCk7XG4gICAgICAgIFJBRy5zY2VuYXJpby5zZXRTdGVwcyhzLnN0ZXBzIGFzIGFueSk7XG4gICAgICAgIFJBRy5zY2VuYXJpby5wbGF5U3RlcChpZHgpO1xuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ1BsYXlpbmcgc3RlcCAnICsgKGlkeCArIDEpICsgJyBvbmx5LicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25QbGF5YmFja0VuZGVkKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc2V0RWRpdGluZ0VuYWJsZWQodHJ1ZSk7XG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0U3RlcCgtMSk7XG4gICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoLTEsIDApO1xuICAgICAgICB0aGlzLnNldE5vd1BsYXlpbmcoJ0lkbGUnLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqIExvY2tzIHRoaXMgdGFiJ3Mgb3duIG1haW4gc2NyZWVuIHdoaWxlIGEgc2NlbmFyaW8gaXMgcGxheWluZyAqL1xuICAgIHByaXZhdGUgc2V0RWRpdGluZ0VuYWJsZWQob246IGJvb2xlYW4pOiB2b2lkXG4gICAge1xuICAgICAgICBpZiAoUkFHLnZpZXdzKVxuICAgICAgICAgICAgUkFHLnZpZXdzLm1haW4uc3R5bGUucG9pbnRlckV2ZW50cyA9IG9uID8gJycgOiAnbm9uZSc7XG5cbiAgICAgICAgbGV0IHRvb2xiYXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9vbGJhcicpO1xuICAgICAgICBpZiAodG9vbGJhcilcbiAgICAgICAgICAgIHRvb2xiYXIuc3R5bGUucG9pbnRlckV2ZW50cyA9IG9uID8gJycgOiAnbm9uZSc7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSAIFByb2dyZXNzIGFuZCBoaWdobGlnaHQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBwcml2YXRlIHVwZGF0ZVByb2dyZXNzKGlkeDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKCF0aGlzLnByb2dyZXNzVGV4dEVsIHx8ICF0aGlzLnByb2dyZXNzRmlsbEVsKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmIChpZHggPCAwKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnByb2dyZXNzVGV4dEVsLnRleHRDb250ZW50ID0gJ0lkbGUnO1xuICAgICAgICAgICAgdGhpcy5wcm9ncmVzc0ZpbGxFbC5zdHlsZS53aWR0aCA9ICcwJSc7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcGN0ID0gdG90YWwgPiAwID8gTWF0aC5yb3VuZCgoKGlkeCArIDEpIC8gdG90YWwpICogMTAwKSA6IDA7XG4gICAgICAgIHRoaXMucHJvZ3Jlc3NUZXh0RWwudGV4dENvbnRlbnQgPSAnU3RlcCAnICsgKGlkeCArIDEpICsgJyBvZiAnICsgdG90YWw7XG4gICAgICAgIHRoaXMucHJvZ3Jlc3NGaWxsRWwuc3R5bGUud2lkdGggPSBwY3QgKyAnJSc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoaWdobGlnaHRTdGVwKGlkeDogbnVtYmVyKTogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5wYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1zdGVwJykuZm9yRWFjaCgoZWwsIGkpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGVsLmNsYXNzTGlzdC50b2dnbGUoJ3J1bm5pbmcnLCBpID09PSBpZHgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyDilIDilIAgUmVuZGVyaW5nIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgcHVibGljIHJlbmRlcigpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuXG4gICAgICAgIGxldCBsaXN0SHRtbCA9IHRoaXMuc2NlbmFyaW9zLm1hcChzYyA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgY2xzID0gc2MuaWQgPT09IHRoaXMuY3VycmVudElkID8gJ2Rhc2gtc2NlbiBhY3RpdmUnIDogJ2Rhc2gtc2Nlbic7XG4gICAgICAgICAgICByZXR1cm4gYDxsaSBjbGFzcz1cIiR7Y2xzfVwiIGRhdGEtaWQ9XCIke3RoaXMuZXNjKHNjLmlkKX1cIj4ke3RoaXMuZXNjKHNjLm5hbWUpfSA8c3BhbiBjbGFzcz1cImRhc2gtc2Nlbi1tZXRhXCI+JHtzYy5zdGVwcy5sZW5ndGh9IHN0ZXBzPC9zcGFuPjwvbGk+YDtcbiAgICAgICAgfSkuam9pbignJyk7XG5cbiAgICAgICAgbGV0IHN0ZXBzSHRtbCA9ICcnO1xuICAgICAgICBpZiAocylcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IHNjID0gcztcbiAgICAgICAgICAgIHN0ZXBzSHRtbCA9IHNjLnN0ZXBzLm1hcCgoc3QsIGkpID0+IHRoaXMuc3RlcEh0bWwoc2MsIHN0LCBpKSkuam9pbignJyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnBhbmVsLmlubmVySFRNTCA9XG4gICAgICAgIGA8ZGl2IGNsYXNzPVwiZGFzaFwiPlxuICAgICAgICAgICAgPGgxPlNjZW5hcmlvIERhc2hib2FyZDwvaDE+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1yb3cgZGFzaC1oZWFkXCI+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImRhc2hTZXR0aW5nc1wiIHR5cGU9XCJidXR0b25cIiB0aXRsZT1cIk9wZW4gdGhlIHNldHRpbmdzIHNjcmVlblwiPlNldHRpbmdzPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImRhc2hPcGVuRGlzcGxheVwiIHR5cGU9XCJidXR0b25cIiB0aXRsZT1cIk9wZW4gdGhlIGFubm91bmNlbWVudCBkaXNwbGF5IChzY3JlZW4uaHRtbCkgaW4gYSBuZXcgdGFiXCI+T3BlbiBkaXNwbGF5PC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPGgyPlNjZW5hcmlvczwvaDI+XG4gICAgICAgICAgICA8dWw+JHtsaXN0SHRtbH08L3VsPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcm93XCI+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImRhc2hOZXdcIiB0eXBlPVwiYnV0dG9uXCI+TmV3IHNjZW5hcmlvPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJkYXNoLWVkaXRvclwiPlxuICAgICAgICAgICAgICAgICR7cyA/IHRoaXMuZWRpdG9ySHRtbChzLCBzdGVwc0h0bWwpIDogJzxwIGNsYXNzPVwiZGFzaC1oaW50XCI+U2VsZWN0IGEgc2NlbmFyaW8gYWJvdmUsIG9yIGNyZWF0ZSBhIG5ldyBvbmUuPC9wPid9XG4gICAgICAgICAgICA8L3NlY3Rpb24+XG4gICAgICAgIDwvZGl2PmA7XG5cbiAgICAgICAgdGhpcy5wcm9ncmVzc1RleHRFbCA9IHRoaXMucGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hQcm9ncmVzc1RleHQnKTtcbiAgICAgICAgdGhpcy5wcm9ncmVzc0ZpbGxFbCA9IHRoaXMucGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hQcm9ncmVzc0ZpbGwnKTtcbiAgICAgICAgdGhpcy5iaW5kKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBlZGl0b3JIdG1sKHM6IERhc2hTY2VuYXJpbywgc3RlcHNIdG1sOiBzdHJpbmcpOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIGxldCBzdGVwc0xpc3QgPSBzdGVwc0h0bWwubGVuZ3RoID4gMFxuICAgICAgICAgICAgPyBzdGVwc0h0bWxcbiAgICAgICAgICAgIDogJzxwIGNsYXNzPVwiZGFzaC1oaW50XCI+Tm8gc3RlcHMgeWV0LiBDYXB0dXJlIHRoZSBjdXJyZW50IGFubm91bmNlbWVudCwgb3IgYWRkIGEgd2FpdCBzdGVwLjwvcD4nO1xuXG4gICAgICAgIHJldHVybiBgPGRpdiBjbGFzcz1cImRhc2gtcm93XCI+XG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiZGFzaC1maWVsZFwiPk5hbWUgPGlucHV0IGlkPVwiZGFzaE5hbWVcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt0aGlzLmVzYyhzLm5hbWUpfVwiPjwvbGFiZWw+XG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiZGFzaC1maWVsZFwiPkxvb3AgY291bnQgPGlucHV0IGlkPVwiZGFzaExvb3BcIiB0eXBlPVwibnVtYmVyXCIgdmFsdWU9XCIke3MubG9vcENvdW50fVwiIG1pbj1cIjFcIiB0aXRsZT1cIkhvdyBtYW55IHRpbWVzIHRvIHJlcGVhdCB0aGUgd2hvbGUgc2NlbmFyaW9cIj48L2xhYmVsPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1yb3dcIj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiZGFzaEFkZFN0ZXBcIiB0eXBlPVwiYnV0dG9uXCIgdGl0bGU9XCJBZGQgdGhlIGN1cnJlbnQgYW5ub3VuY2VtZW50IGFzIGEgc3RlcFwiPkNhcHR1cmUgc3RlcDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoQWRkV2FpdFwiIHR5cGU9XCJidXR0b25cIiB0aXRsZT1cIkFkZCBhIHNpbGVudCBwYXVzZVwiPkFkZCB3YWl0IHN0ZXA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiZGFzaEltcG9ydFwiIHR5cGU9XCJidXR0b25cIj5JbXBvcnQgSlNPTjwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoRXhwb3J0XCIgdHlwZT1cImJ1dHRvblwiPkV4cG9ydCBKU09OPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxoMj5TdGVwczwvaDI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1zdGVwc1wiPiR7c3RlcHNMaXN0fTwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcnVuXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtbm93cGxheWluZ1wiIGlkPVwiZGFzaE5vd1BsYXlpbmdcIj5JZGxlPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcm93XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoUGxheVwiIHR5cGU9XCJidXR0b25cIj5QbGF5PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoU3RvcFwiIHR5cGU9XCJidXR0b25cIj5TdG9wPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcHJvZ3Jlc3NcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJkYXNoUHJvZ3Jlc3NUZXh0XCI+SWRsZTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcHJvZ3Jlc3MtYmFyXCI+PGRpdiBjbGFzcz1cImRhc2gtcHJvZ3Jlc3MtZmlsbFwiIGlkPVwiZGFzaFByb2dyZXNzRmlsbFwiPjwvZGl2PjwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+YDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0ZXBIdG1sKHM6IERhc2hTY2VuYXJpbywgc3Q6IERhc2hTdGVwLCBpOiBudW1iZXIpOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIGxldCB0aXRsZSA9IHN0LnR5cGUgPT09ICd3YWl0JyA/ICgnV2FpdCAnICsgKHN0LndhaXRTZWNvbmRzIHx8IDApICsgJ3MnKSA6ICgnU3RlcCAnICsgKGkgKyAxKSk7XG4gICAgICAgIGxldCBnYXBJbnB1dCA9IHN0LnR5cGUgPT09ICdhbm5vdW5jZW1lbnQnXG4gICAgICAgICAgICA/IGA8bGFiZWwgY2xhc3M9XCJkYXNoLWZpZWxkXCI+R2FwIChtcykgPGlucHV0IGNsYXNzPVwiZGFzaC1nYXBcIiB0eXBlPVwibnVtYmVyXCIgZGF0YS1pZHg9XCIke2l9XCIgdmFsdWU9XCIke3N0LmdhcE1zfVwiIG1pbj1cIjBcIiBzdGVwPVwiMTAwXCIgdGl0bGU9XCJQYXVzZSBhZnRlciB0aGlzIHN0ZXAsIGluIG1pbGxpc2Vjb25kc1wiPjwvbGFiZWw+YFxuICAgICAgICAgICAgOiAnJztcbiAgICAgICAgbGV0IHdhaXRJbnB1dCA9IHN0LnR5cGUgPT09ICd3YWl0J1xuICAgICAgICAgICAgPyBgPGxhYmVsIGNsYXNzPVwiZGFzaC1maWVsZFwiPldhaXQgKHMpIDxpbnB1dCBjbGFzcz1cImRhc2gtd2FpdFwiIHR5cGU9XCJudW1iZXJcIiBkYXRhLWlkeD1cIiR7aX1cIiB2YWx1ZT1cIiR7c3Qud2FpdFNlY29uZHMgfHwgMH1cIiBtaW49XCIwXCIgc3RlcD1cIjFcIiB0aXRsZT1cIlNpbGVudCBwYXVzZSwgaW4gc2Vjb25kc1wiPjwvbGFiZWw+YFxuICAgICAgICAgICAgOiAnJztcbiAgICAgICAgbGV0IGFubkJ1dHRvbnMgPSBzdC50eXBlID09PSAnYW5ub3VuY2VtZW50J1xuICAgICAgICAgICAgPyBgPGJ1dHRvbiBjbGFzcz1cImRhc2gtZWRpdFwiIHR5cGU9XCJidXR0b25cIiBkYXRhLWlkeD1cIiR7aX1cIiB0aXRsZT1cIk9wZW4gdGhpcyBzdGVwIGluIHRoZSBlZGl0b3IgdG8gY2hhbmdlIGl0XCI+RWRpdDwvYnV0dG9uPmBcbiAgICAgICAgICAgIDogJyc7XG5cbiAgICAgICAgcmV0dXJuIGA8ZGl2IGNsYXNzPVwiZGFzaC1zdGVwXCIgZGF0YS1pZHg9XCIke2l9XCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1zdGVwLXRpdGxlXCI+PHNwYW4+JHt0aXRsZX08L3NwYW4+PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1yb3dcIj5cbiAgICAgICAgICAgICAgICAke2dhcElucHV0fVxuICAgICAgICAgICAgICAgICR7d2FpdElucHV0fVxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiZGFzaC1yb3ctYnRuc1wiPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGFzaC11cFwiIHR5cGU9XCJidXR0b25cIiBkYXRhLWlkeD1cIiR7aX1cIiB0aXRsZT1cIk1vdmUgdXBcIiAke2kgPT09IDAgPyAnZGlzYWJsZWQnIDogJyd9PuKGkTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGFzaC1kb3duXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtaWR4PVwiJHtpfVwiIHRpdGxlPVwiTW92ZSBkb3duXCIgJHtpID09PSBzLnN0ZXBzLmxlbmd0aCAtIDEgPyAnZGlzYWJsZWQnIDogJyd9PuKGkzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGFzaC1zdGVwcGxheVwiIHR5cGU9XCJidXR0b25cIiBkYXRhLWlkeD1cIiR7aX1cIiB0aXRsZT1cIlBsYXkgb25seSB0aGlzIHN0ZXBcIj7ilrY8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgJHthbm5CdXR0b25zfVxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGFzaC1kZWxcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1pZHg9XCIke2l9XCIgdGl0bGU9XCJEZWxldGUgdGhpcyBzdGVwXCI+4pyVPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PmA7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSAIEV2ZW50IGJpbmRpbmcg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBwcml2YXRlIGJpbmQoKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHBhbmVsID0gdGhpcy5wYW5lbDtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1zY2VuJykuZm9yRWFjaChsaSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAobGkgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRJZCA9IChsaSBhcyBIVE1MRWxlbWVudCkuZGF0YXNldFsnaWQnXSB8fCBudWxsO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZClcbiAgICAgICAgICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3JhZy5jdXJyZW50U2NlbmFyaW9JZCcsIHRoaXMuY3VycmVudElkKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBidG5TZXR0aW5ncyA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoU2V0dGluZ3MnKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChidG5TZXR0aW5ncylcbiAgICAgICAgICAgIGJ0blNldHRpbmdzLm9uY2xpY2sgPSAoKSA9PiBSQUcudmlld3Muc2V0dGluZ3Mub3BlbigpO1xuXG4gICAgICAgIGxldCBidG5PcGVuRGlzcGxheSA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoT3BlbkRpc3BsYXknKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChidG5PcGVuRGlzcGxheSlcbiAgICAgICAgICAgIGJ0bk9wZW5EaXNwbGF5Lm9uY2xpY2sgPSAoKSA9PiB3aW5kb3cub3Blbignc2NyZWVuLmh0bWwnLCAnX2JsYW5rJyk7XG5cbiAgICAgICAgbGV0IGJ0bk5ldyA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoTmV3JykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuTmV3KVxuICAgICAgICAgICAgYnRuTmV3Lm9uY2xpY2sgPSAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCBpZCA9ICdzY25fJyArIERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zY2VuYXJpb3MucHVzaCh7IGlkOiBpZCwgbmFtZTogJ1NjZW5hcmlvICcgKyAodGhpcy5zY2VuYXJpb3MubGVuZ3RoICsgMSksIHN0ZXBzOiBbXSwgbG9vcENvdW50OiAxLCBjcmVhdGVkQXQ6IERhdGUubm93KCksIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRJZCA9IGlkO1xuICAgICAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcuY3VycmVudFNjZW5hcmlvSWQnLCBpZCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgbGV0IGJ0bkFkZCA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoQWRkU3RlcCcpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKGJ0bkFkZClcbiAgICAgICAgICAgIGJ0bkFkZC5vbmNsaWNrID0gKCkgPT4gdGhpcy5jYXB0dXJlU3RlcCgpO1xuXG4gICAgICAgIGxldCBidG5XYWl0ID0gcGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hBZGRXYWl0JykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuV2FpdClcbiAgICAgICAgICAgIGJ0bldhaXQub25jbGljayA9ICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBzLnN0ZXBzLnB1c2goeyB0eXBlOiAnd2FpdCcsIGdhcE1zOiAwLCB3YWl0U2Vjb25kczogMyB9KTtcbiAgICAgICAgICAgICAgICBzLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtdXAnKS5mb3JFYWNoKGIgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGIgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5tb3ZlU3RlcChiIGFzIEhUTUxFbGVtZW50LCAtMSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1kb3duJykuZm9yRWFjaChiID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChiIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMubW92ZVN0ZXAoYiBhcyBIVE1MRWxlbWVudCwgMSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1kZWwnKS5mb3JFYWNoKGIgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGIgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5kZWxldGVTdGVwKGIgYXMgSFRNTEVsZW1lbnQpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtZWRpdCcpLmZvckVhY2goYiA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAoYiBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLmVkaXRTdGVwKHBhcnNlSW50KChiIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0WydpZHgnXSB8fCAnMCcsIDEwKSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1zdGVwcGxheScpLmZvckVhY2goYiA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAoYiBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCBpZHggPSBwYXJzZUludCgoYiBhcyBIVE1MRWxlbWVudCkuZGF0YXNldFsnaWR4J10gfHwgJzAnLCAxMCk7XG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U3RlcE9ubHkoaWR4KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1nYXAnKS5mb3JFYWNoKGlucCA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAoaW5wIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCBpZHggPSBwYXJzZUludCgoaW5wIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0WydpZHgnXSB8fCAnMCcsIDEwKTtcbiAgICAgICAgICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICAgICAgICAgIGlmICghcylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHMuc3RlcHNbaWR4XS5nYXBNcyA9IHBhcnNlSW50KChpbnAgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUsIDEwKSB8fCAwO1xuICAgICAgICAgICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC13YWl0JykuZm9yRWFjaChpbnAgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGlucCBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoKGlucCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldFsnaWR4J10gfHwgJzAnLCAxMCk7XG4gICAgICAgICAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBzLnN0ZXBzW2lkeF0ud2FpdFNlY29uZHMgPSBwYXJzZUludCgoaW5wIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlLCAxMCkgfHwgMDtcbiAgICAgICAgICAgICAgICBzLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgbmFtZUlucHV0ID0gcGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hOYW1lJykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChuYW1lSW5wdXQpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBlbCA9IG5hbWVJbnB1dDtcbiAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBzLm5hbWUgPSBlbC52YWx1ZTtcbiAgICAgICAgICAgICAgICBzLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGxvb3BJbnB1dCA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoTG9vcCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAobG9vcElucHV0KVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgZWwgPSBsb29wSW5wdXQ7XG4gICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFzKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgcy5sb29wQ291bnQgPSBwYXJzZUludChlbC52YWx1ZSwgMTApIHx8IDE7XG4gICAgICAgICAgICAgICAgcy51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZUFsbCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgYnRuUGxheSA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoUGxheScpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKGJ0blBsYXkpXG4gICAgICAgICAgICBidG5QbGF5Lm9uY2xpY2sgPSAoKSA9PiB0aGlzLnN0YXJ0UGxheWJhY2soKTtcblxuICAgICAgICBsZXQgYnRuU3RvcCA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoU3RvcCcpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKGJ0blN0b3ApXG4gICAgICAgICAgICBidG5TdG9wLm9uY2xpY2sgPSAoKSA9PiB0aGlzLnN0b3BQbGF5YmFjaygpO1xuXG4gICAgICAgIGxldCBidG5FeHBvcnQgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaEV4cG9ydCcpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKGJ0bkV4cG9ydClcbiAgICAgICAgICAgIGJ0bkV4cG9ydC5vbmNsaWNrID0gKCkgPT4gdGhpcy5leHBvcnRKc29uKCk7XG5cbiAgICAgICAgbGV0IGJ0bkltcG9ydCA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoSW1wb3J0JykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuSW1wb3J0KVxuICAgICAgICAgICAgYnRuSW1wb3J0Lm9uY2xpY2sgPSAoKSA9PiB0aGlzLmltcG9ydEpzb24oKTtcbiAgICB9XG5cbiAgICAvLyDilIDilIAgU3RlcCBvcGVyYXRpb25zIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgLyoqXG4gICAgICogQWRkcyB0aGUgbGl2ZSBhbm5vdW5jZW1lbnQgYXMgYSBuZXcgc3RlcC4gUHJlZmVycyBhIHNpYmxpbmcgdGFiJ3Mgc3RhdGVcbiAgICAgKiAoYXNrZWQgZm9yIG92ZXIgdGhlIGNoYW5uZWwsIGFuc3dlcmVkIGJ5IHRoZSBlZGl0b3Igcm9sZSk7IGZhbGxzIGJhY2tcbiAgICAgKiB0byB0aGlzIHRhYidzIG93biBzdGF0ZSB3aGVuIG5vIG90aGVyIHRhYiBhbnN3ZXJzIHdpdGhpbiAxLjJzIChpLmUuXG4gICAgICogYnVpbGRpbmcgZGlyZWN0bHkgb24gdGhlIGRhc2hib2FyZCBwYWdlKS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGNhcHR1cmVTdGVwKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBjYXB0dXJlZCA9IGZhbHNlO1xuICAgICAgICBsZXQgbm9uY2UgPSAnY2FwXycgKyBEYXRlLm5vdygpICsgJ18nICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDAwMCk7XG5cbiAgICAgICAgbGV0IGhhbmRsZXIgPSAobXNnOiBhbnkpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGlmIChjYXB0dXJlZCB8fCAhbXNnIHx8IG1zZy5ub25jZSAhPT0gbm9uY2UgfHwgIW1zZy5zdGF0ZUpzb24pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgY2FwdHVyZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKFJBRy5jaGFubmVsKVxuICAgICAgICAgICAgICAgIFJBRy5jaGFubmVsLm9mZignQ0FQVFVSRURfU1RFUF9EQVRBJywgaGFuZGxlcik7XG4gICAgICAgICAgICB0aGlzLnB1c2hTdGVwKG1zZy5zdGF0ZUpzb24pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChSQUcuY2hhbm5lbClcbiAgICAgICAge1xuICAgICAgICAgICAgUkFHLmNoYW5uZWwub24oJ0NBUFRVUkVEX1NURVBfREFUQScsIGhhbmRsZXIpO1xuICAgICAgICAgICAgUkFHLmNoYW5uZWwuc2VuZCgnQ0FQVFVSRV9TVEVQX1JFUVVFU1QnLCB7IG5vbmNlOiBub25jZSB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGlmIChSQUcuY2hhbm5lbClcbiAgICAgICAgICAgICAgICBSQUcuY2hhbm5lbC5vZmYoJ0NBUFRVUkVEX1NURVBfREFUQScsIGhhbmRsZXIpO1xuICAgICAgICAgICAgaWYgKCFjYXB0dXJlZClcbiAgICAgICAgICAgICAgICB0aGlzLnB1c2hTdGVwKEpTT04uc3RyaW5naWZ5KFJBRy5zdGF0ZSkpO1xuICAgICAgICB9LCAxMjAwKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHB1c2hTdGVwKHN0YXRlSnNvbjogc3RyaW5nKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgaWYgKCFzKVxuICAgICAgICB7XG4gICAgICAgICAgICBhbGVydCgnU2VsZWN0IGEgc2NlbmFyaW8gZmlyc3QuJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBzLnN0ZXBzLnB1c2goeyB0eXBlOiAnYW5ub3VuY2VtZW50Jywgc3RhdGVKc29uOiBzdGF0ZUpzb24sIGdhcE1zOiAxNTAwIH0pO1xuICAgICAgICBzLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIHRoaXMuc2F2ZUFsbCgpO1xuICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0NhcHR1cmVkIHN0ZXAgJyArIHMuc3RlcHMubGVuZ3RoICsgJyBpbnRvIFwiJyArIHMubmFtZSArICdcIicpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE9wZW5zIHRoaXMgc3RlcCBpbiB0aGUgc3RlcCBlZGl0b3IgdmlldzogbG9hZHMgaXRzIGFubm91bmNlbWVudCBpbnRvXG4gICAgICogdGhlIGVkaXRvciBvbiB0aGlzIHNhbWUgZGFzaGJvYXJkIHBhZ2UsIHRoZW4gcmV2ZWFscyBpdCB3aXRoIGl0c1xuICAgICAqIHRvb2xiYXIuIFwiVXBkYXRlIFN0ZXBcIiB3cml0ZXMgYmFjayB0byB0aGlzIHN0ZXAg4oCUIHRoZSBrZXlzIHNldCBiZWxvd1xuICAgICAqIGFyZSB3aGF0IGl0IHRhcmdldHMuIE5vIG5ldyB0YWIsIHNvIHRoZSBkYXNoYm9hcmQgdGFiIGtlZXBzIG93bmluZ1xuICAgICAqIHRoZSBhdWRpbyBhbmQgdGhlIHZvaWNlIGlzIG5ldmVyIGRvdWJsZWQuXG4gICAgICovXG4gICAgcHJpdmF0ZSBlZGl0U3RlcChpZHg6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgIGlmICghcyB8fCAhcy5zdGVwc1tpZHhdKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBsZXQgc3RlcCA9IHMuc3RlcHNbaWR4XTtcbiAgICAgICAgaWYgKHN0ZXAudHlwZSAhPT0gJ2Fubm91bmNlbWVudCcgfHwgIXN0ZXAuc3RhdGVKc29uKVxuICAgICAgICB7XG4gICAgICAgICAgICBhbGVydCgnVGhpcyBzdGVwIGhhcyBubyBhbm5vdW5jZW1lbnQgc3RhdGUgdG8gZWRpdC4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcuY3VycmVudFNjZW5hcmlvSWQnLCBzLmlkKTtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3JhZy5zZWxlY3RlZFN0ZXBJbmRleCcsIFN0cmluZyhpZHgpKTtcblxuICAgICAgICBSQUcubG9hZChzdGVwLnN0YXRlSnNvbik7XG4gICAgICAgIC8vIFNuYXBzaG90IGFmdGVyIGxvYWQ6IHRoZSBkaXJ0eSBjaGVjayBjb21wYXJlcyB0aGUgbGl2ZSBzdGF0ZVxuICAgICAgICAvLyBhZ2FpbnN0IHRoaXMsIHNvIHRoZSBzdGVwJ3Mgb3duIHN0YXRlIHJlYWRzIGFzIGNsZWFuLlxuICAgICAgICB0aGlzLmVkaXRTbmFwc2hvdCA9IEpTT04uc3RyaW5naWZ5KFJBRy5zdGF0ZSk7XG4gICAgICAgIHRoaXMub3BlbkVkaXQoKTtcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdFZGl0aW5nIHN0ZXAgJyArIChpZHggKyAxKSArICcgb2YgXCInICsgcy5uYW1lICsgJ1wiLiBNYWtlIHlvdXIgY2hhbmdlcywgdGhlbiBjbGljayBcIlVwZGF0ZSBTdGVwXCIgdG8gc2F2ZSB0aGVtIGJhY2suJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBtb3ZlU3RlcChidG46IEhUTUxFbGVtZW50LCBkaXI6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludChidG4uZGF0YXNldFsnaWR4J10gfHwgJzAnLCAxMCk7XG4gICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgIGlmICghcylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgbGV0IHRvID0gaWR4ICsgZGlyO1xuICAgICAgICBpZiAodG8gPCAwIHx8IHRvID49IHMuc3RlcHMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGxldCB0bXAgPSBzLnN0ZXBzW3RvXTtcbiAgICAgICAgcy5zdGVwc1t0b10gPSBzLnN0ZXBzW2lkeF07XG4gICAgICAgIHMuc3RlcHNbaWR4XSA9IHRtcDtcbiAgICAgICAgcy51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRlbGV0ZVN0ZXAoYnRuOiBIVE1MRWxlbWVudCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludChidG4uZGF0YXNldFsnaWR4J10gfHwgJzAnLCAxMCk7XG4gICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgIGlmICghcylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgaWYgKCFjb25maXJtKCdEZWxldGUgdGhpcyBzdGVwPycpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHMuc3RlcHMuc3BsaWNlKGlkeCwgMSk7XG4gICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSAIEltcG9ydCAvIGV4cG9ydCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuICAgIHByaXZhdGUgZXhwb3J0SnNvbigpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHRoaXMuc2NlbmFyaW9zLCBudWxsLCAyKTtcbiAgICAgICAgbGV0IGJsb2IgPSBuZXcgQmxvYihbcGF5bG9hZF0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICBsZXQgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgbGV0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGEuaHJlZiA9IHVybDtcbiAgICAgICAgYS5kb3dubG9hZCA9ICdyYWctc2NlbmFyaW9zLmpzb24nO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGEpO1xuICAgICAgICBhLmNsaWNrKCk7XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYSk7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGltcG9ydEpzb24oKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgICAgICAgaW5wdXQudHlwZSA9ICdmaWxlJztcbiAgICAgICAgaW5wdXQuYWNjZXB0ID0gJ2FwcGxpY2F0aW9uL2pzb24sIC5qc29uJztcbiAgICAgICAgaW5wdXQub25jaGFuZ2UgPSBhc3luYyAoKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgZmlsZSA9IGlucHV0LmZpbGVzICYmIGlucHV0LmZpbGVzWzBdO1xuICAgICAgICAgICAgaWYgKCFmaWxlKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGxldCBmID0gZmlsZTtcblxuICAgICAgICAgICAgbGV0IHRleHQgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KHJlc29sdmUgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICAgICAgICAgICAgICByZWFkZXIub25sb2FkID0gKCkgPT4gcmVzb2x2ZShyZWFkZXIucmVzdWx0IGFzIHN0cmluZyk7XG4gICAgICAgICAgICAgICAgcmVhZGVyLm9uZXJyb3IgPSAoKSA9PiByZXNvbHZlKCcnKTtcbiAgICAgICAgICAgICAgICByZWFkZXIucmVhZEFzVGV4dChmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKHRleHQgPT09ICcnKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdHJ5XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IGltcG9ydGVkID0gSlNPTi5wYXJzZSh0ZXh0KSBhcyBEYXNoU2NlbmFyaW9bXTtcbiAgICAgICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoaW1wb3J0ZWQpKVxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGFuIGFycmF5IG9mIHNjZW5hcmlvcycpO1xuXG4gICAgICAgICAgICAgICAgaW1wb3J0ZWQuZm9yRWFjaChzYyA9PlxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzYy5pZClcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjLmlkID0gJ3Njbl8nICsgRGF0ZS5ub3coKSArICdfJyArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjLnN0ZXBzKVxuICAgICAgICAgICAgICAgICAgICAgICAgc2Muc3RlcHMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgc2Muc3RlcHMuZm9yRWFjaChzdCA9PiB0aGlzLmNsZWFuU3RlcChzdCkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjLmxvb3BDb3VudClcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjLmxvb3BDb3VudCA9IDE7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2MuY3JlYXRlZEF0KVxuICAgICAgICAgICAgICAgICAgICAgICAgc2MuY3JlYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzYy51cGRhdGVkQXQpXG4gICAgICAgICAgICAgICAgICAgICAgICBzYy51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5zY2VuYXJpb3MgPSB0aGlzLnNjZW5hcmlvcy5jb25jYXQoaW1wb3J0ZWQpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZCA9PT0gbnVsbCAmJiB0aGlzLnNjZW5hcmlvcy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRJZCA9IHRoaXMuc2NlbmFyaW9zW3RoaXMuc2NlbmFyaW9zLmxlbmd0aCAtIDFdLmlkO1xuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZUFsbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdJbXBvcnRlZCAnICsgaW1wb3J0ZWQubGVuZ3RoICsgJyBzY2VuYXJpbyhzKS4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGFsZXJ0KCdJbnZhbGlkIEpTT046IGV4cGVjdGVkIGFuIGFycmF5IG9mIHNjZW5hcmlvcy4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgaW5wdXQuY2xpY2soKTtcbiAgICB9XG59XG5cbih3aW5kb3cgYXMgYW55KS5TY2VuYXJpb0Rhc2hib2FyZCA9IFNjZW5hcmlvRGFzaGJvYXJkO1xuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIExhbmd1YWdlIGVudHJpZXMgYXJlIHRlbXBsYXRlIGRlbGVnYXRlcyAqL1xyXG50eXBlIExhbmd1YWdlRW50cnkgPSAoLi4ucGFydHM6IHN0cmluZ1tdKSA9PiBzdHJpbmc7XHJcblxyXG4vKiogTGFuZ3VhZ2UgZGVmaW5pdGlvbnMgZm9yIEVuZ2xpc2g7IGFsc28gYWN0cyBhcyB0aGUgYmFzZSBsYW5ndWFnZSAqL1xyXG5jbGFzcyBFbmdsaXNoTGFuZ3VhZ2Vcclxue1xyXG4gICAgW2luZGV4OiBzdHJpbmddIDogTGFuZ3VhZ2VFbnRyeSB8IHN0cmluZyB8IHN0cmluZ1tdO1xyXG5cclxuICAgIC8vIFJBR1xyXG5cclxuICAgIFdFTENPTUUgICAgICAgPSAnV2VsY29tZSB0byBSYWlsIEFubm91bmNlbWVudCBHZW5lcmF0b3IuJztcclxuICAgIERPTV9NSVNTSU5HICAgPSAocTogYW55KSA9PiBgUmVxdWlyZWQgRE9NIGVsZW1lbnQgaXMgbWlzc2luZzogJyR7cX0nYDtcclxuICAgIEFUVFJfTUlTU0lORyAgPSAoYTogYW55KSA9PiBgUmVxdWlyZWQgYXR0cmlidXRlIGlzIG1pc3Npbmc6ICcke2F9J2A7XHJcbiAgICBEQVRBX01JU1NJTkcgID0gKGs6IGFueSkgPT4gYFJlcXVpcmVkIGRhdGFzZXQga2V5IGlzIG1pc3Npbmcgb3IgZW1wdHk6ICcke2t9J2A7XHJcbiAgICBCQURfRElSRUNUSU9OID0gKHY6IGFueSkgPT4gYERpcmVjdGlvbiBuZWVkcyB0byBiZSAtMSBvciAxLCBub3QgJyR7dn0nYDtcclxuICAgIEJBRF9CT09MRUFOICAgPSAodjogYW55KSA9PiBgR2l2ZW4gc3RyaW5nIGRvZXMgbm90IHJlcHJlc2VudCBhIGJvb2xlYW46ICcke3Z9J2A7XHJcblxyXG4gICAgLy8gU3RhdGVcclxuXHJcbiAgICBTVEFURV9GUk9NX1NUT1JBR0UgID0gJ1N0YXRlIGhhcyBiZWVuIGxvYWRlZCBmcm9tIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX0JBRF9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBBdHRlbXB0ZWQgdG8gZ2V0IGNob3NlbiBpbmRleCBmb3IgcGhyYXNlc2V0ICgke3J9KSB0aGF0IGRvZXNuJ3QgZXhpc3QuYDtcclxuXHJcbiAgICAvLyBDb25maWdcclxuXHJcbiAgICBDT05GSUdfTE9BRF9GQUlMICA9IChtc2c6IGFueSkgPT4gYENvdWxkIG5vdCBsb2FkIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1NBVkVfRkFJTCAgPSAobXNnOiBhbnkpID0+IGBDb3VsZCBub3Qgc2F2ZSBzZXR0aW5nczogJHttc2d9YDtcclxuICAgIENPTkZJR19SRVNFVF9GQUlMID0gKG1zZzogYW55KSA9PiBgQ291bGQgbm90IGNsZWFyIHNldHRpbmdzOiAke21zZ31gO1xyXG5cclxuICAgIC8vIERhdGFiYXNlXHJcblxyXG4gICAgREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRSA9IChlOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENvbmZpZ3VyZWQgcGhyYXNlc2V0IGVsZW1lbnQgcXVlcnkgJyR7ZX0nIGRvZXMgbm90IHBvaW50IHRvIGFuIGlmcmFtZSBlbWJlZC5gO1xyXG5cclxuICAgIERCX1VOS05PV05fU1RBVElPTiAgID0gKGM6IGFueSkgPT4gYFVOS05PV04gU1RBVElPTjogJHtjfWA7XHJcbiAgICBEQl9FTVBUWV9TVEFUSU9OICAgICA9IChjOiBhbnkpID0+XHJcbiAgICAgICAgYFN0YXRpb24gZGF0YWJhc2UgYXBwZWFycyB0byBjb250YWluIGFuIGVtcHR5IG5hbWUgZm9yIGNvZGUgJyR7Y30nLmA7XHJcbiAgICBEQl9UT09fTUFOWV9TVEFUSU9OUyA9ICgpID0+ICdQaWNraW5nIHRvbyBtYW55IHN0YXRpb25zIHRoYW4gdGhlcmUgYXJlIGF2YWlsYWJsZSc7XHJcblxyXG4gICAgLy8gVG9vbGJhclxyXG5cclxuICAgIFRPT0xCQVJfUExBWSAgICAgPSAnUGxheSBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TVE9QICAgICA9ICdTdG9wIHBsYXlpbmcgcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0hVRkZMRSAgPSAnR2VuZXJhdGUgcmFuZG9tIHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NFVFRJTkdTID0gJ09wZW4gc2V0dGluZ3MnO1xyXG4gICAgVE9PTEJBUl9DTE9TRSAgICA9ICdDbG9zZSB0aGUgZWRpdG9yIGFuZCByZXR1cm4gdG8gdGhlIHNjZW5hcmlvIGRhc2hib2FyZCc7XHJcblxyXG4gICAgLy8gRWRpdG9yXHJcblxyXG4gICAgVElUTEVfQ09BQ0ggICAgICAgPSAoYzogYW55KSA9PiBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgY29hY2ggKCcke2N9JylgO1xyXG4gICAgVElUTEVfRVhDVVNFICAgICAgPSAnQ2xpY2sgdG8gY2hhbmdlIHRoaXMgZXhjdXNlJztcclxuICAgIFRJVExFX0lOVEVHRVIgICAgID0gKGM6IGFueSkgPT4gYENsaWNrIHRvIGNoYW5nZSB0aGlzIG51bWJlciAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9OQU1FRCAgICAgICA9ICdDbGljayB0byBjaGFuZ2UgdGhpcyB0cmFpblxcJ3MgbmFtZSc7XHJcbiAgICBUSVRMRV9PUFRfT1BFTiAgICA9ICh0OiBhbnksIHI6IGFueSkgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gb3BlbiB0aGlzIG9wdGlvbmFsICR7dH0gKCcke3J9JylgO1xyXG4gICAgVElUTEVfT1BUX0NMT1NFICAgPSAodDogYW55LCByOiBhbnkpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNsb3NlIHRoaXMgb3B0aW9uYWwgJHt0fSAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9QSFJBU0VTRVQgICA9IChyOiBhbnkpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGUgcGhyYXNlIHVzZWQgaW4gdGhpcyBzZWN0aW9uICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BMQVRGT1JNICAgID0gJ0NsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluXFwncyBwbGF0Zm9ybSc7XHJcbiAgICBUSVRMRV9TRVJWSUNFICAgICA9IChjOiBhbnkpID0+IGBDbGljayB0byBjaGFuZ2UgdGhpcyBzZXJ2aWNlICgnJHtjfScpYDtcclxuICAgIFRJVExFX1NUQVRJT04gICAgID0gKGM6IGFueSkgPT4gYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gKCcke2N9JylgO1xyXG4gICAgVElUTEVfU1RBVElPTkxJU1QgPSAoYzogYW55KSA9PiBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc3RhdGlvbiBsaXN0ICgnJHtjfScpYDtcclxuICAgIFRJVExFX1RJTUUgICAgICAgID0gKGM6IGFueSkgPT4gYENsaWNrIHRvIGNoYW5nZSB0aGlzIHRpbWUgKCcke2N9JylgO1xyXG5cclxuICAgIEVESVRPUl9JTklUICAgICAgICAgICAgICA9ICdQbGVhc2Ugd2FpdC4uLic7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9FTEVNRU5UICAgPSAobjogYW55KSA9PiBgKFVOS05PV04gWE1MIEVMRU1FTlQ6ICR7bn0pYDtcclxuICAgIEVESVRPUl9VTktOT1dOX1BIUkFTRSAgICA9IChyOiBhbnkpID0+IGAoVU5LTk9XTiBQSFJBU0U6ICR7cn0pYDtcclxuICAgIEVESVRPUl9VTktOT1dOX1BIUkFTRVNFVCA9IChyOiBhbnkpID0+IGAoVU5LTk9XTiBQSFJBU0VTRVQ6ICR7cn0pYDtcclxuXHJcbiAgICAvLyBQaHJhc2VyXHJcblxyXG4gICAgUEhSQVNFUl9UT09fUkVDVVJTSVZFID0gJ1RvbyBtYW55IGxldmVscyBvZiByZWN1cnNpb24gd2hpbHN0IHByb2Nlc3NpbmcgcGhyYXNlLic7XHJcblxyXG4gICAgLy8gUGlja2Vyc1xyXG5cclxuICAgIEhFQURFUl9DT0FDSCAgICAgICA9IChjOiBhbnkpID0+IGBQaWNrIGEgY29hY2ggbGV0dGVyIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX0VYQ1VTRSAgICAgID0gJ1BpY2sgYW4gZXhjdXNlJztcclxuICAgIEhFQURFUl9JTlRFR0VSICAgICA9IChjOiBhbnkpID0+IGBQaWNrIGEgbnVtYmVyIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX05BTUVEICAgICAgID0gJ1BpY2sgYSBuYW1lZCB0cmFpbic7XHJcbiAgICBIRUFERVJfUEhSQVNFU0VUICAgPSAocjogYW55KSA9PiBgUGljayBhIHBocmFzZSBmb3IgdGhlICcke3J9JyBzZWN0aW9uYDtcclxuICAgIEhFQURFUl9QTEFURk9STSAgICA9ICdQaWNrIGEgcGxhdGZvcm0nO1xyXG4gICAgSEVBREVSX1NFUlZJQ0UgICAgID0gKGM6IGFueSkgPT4gYFBpY2sgYSBzZXJ2aWNlIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1NUQVRJT04gICAgID0gKGM6IGFueSkgPT4gYFBpY2sgYSBzdGF0aW9uIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1NUQVRJT05MSVNUID0gKGM6IGFueSkgPT4gYEJ1aWxkIGEgc3RhdGlvbiBsaXN0IGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1RJTUUgICAgICAgID0gKGM6IGFueSkgPT4gYFBpY2sgYSB0aW1lIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG5cclxuICAgIFBfR0VORVJJQ19UICAgICAgPSAnTGlzdCBvZiBjaG9pY2VzJztcclxuICAgIFBfR0VORVJJQ19QSCAgICAgPSAnRmlsdGVyIGNob2ljZXMuLi4nO1xyXG4gICAgUF9DT0FDSF9UICAgICAgICA9ICdDb2FjaCBsZXR0ZXInO1xyXG4gICAgUF9FWENVU0VfVCAgICAgICA9ICdMaXN0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzJztcclxuICAgIFBfRVhDVVNFX1BIICAgICAgPSAnRmlsdGVyIGV4Y3VzZXMuLi4nO1xyXG4gICAgUF9FWENVU0VfSVRFTV9UICA9ICdDbGljayB0byBzZWxlY3QgdGhpcyBleGN1c2UnO1xyXG4gICAgUF9JTlRfVCAgICAgICAgICA9ICdJbnRlZ2VyIHZhbHVlJztcclxuICAgIFBfTkFNRURfVCAgICAgICAgPSAnTGlzdCBvZiB0cmFpbiBuYW1lcyc7XHJcbiAgICBQX05BTUVEX1BIICAgICAgID0gJ0ZpbHRlciB0cmFpbiBuYW1lLi4uJztcclxuICAgIFBfTkFNRURfSVRFTV9UICAgPSAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgbmFtZSc7XHJcbiAgICBQX1BTRVRfVCAgICAgICAgID0gJ0xpc3Qgb2YgcGhyYXNlcyc7XHJcbiAgICBQX1BTRVRfUEggICAgICAgID0gJ0ZpbHRlciBwaHJhc2VzLi4uJztcclxuICAgIFBfUFNFVF9JVEVNX1QgICAgPSAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgcGhyYXNlJztcclxuICAgIFBfUExBVF9OVU1CRVJfVCAgPSAnUGxhdGZvcm0gbnVtYmVyJztcclxuICAgIFBfUExBVF9MRVRURVJfVCAgPSAnT3B0aW9uYWwgcGxhdGZvcm0gbGV0dGVyJztcclxuICAgIFBfU0VSVl9UICAgICAgICAgPSAnTGlzdCBvZiBzZXJ2aWNlIG5hbWVzJztcclxuICAgIFBfU0VSVl9QSCAgICAgICAgPSAnRmlsdGVyIHNlcnZpY2VzLi4uJztcclxuICAgIFBfU0VSVl9JVEVNX1QgICAgPSAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgc2VydmljZSc7XHJcbiAgICBQX1NUQVRJT05fVCAgICAgID0gJ0xpc3Qgb2Ygc3RhdGlvbiBuYW1lcyc7XHJcbiAgICBQX1NUQVRJT05fUEggICAgID0gJ0ZpbHRlciBzdGF0aW9ucy4uLic7XHJcbiAgICBQX1NUQVRJT05fSVRFTV9UID0gJ0NsaWNrIHRvIHNlbGVjdCBvciBhZGQgdGhpcyBzdGF0aW9uJztcclxuICAgIFBfU0xfQUREICAgICAgICAgPSAnQWRkIHN0YXRpb24uLi4nO1xyXG4gICAgUF9TTF9BRERfVCAgICAgICA9ICdBZGQgc3RhdGlvbiB0byB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9DTE9TRSAgICAgICA9ICdDbG9zZSc7XHJcbiAgICBQX1NMX0NMT1NFX1QgICAgID0gJ0Nsb3NlIHRoaXMgcGlja2VyJztcclxuICAgIFBfU0xfRU1QVFkgICAgICAgPSAnUGxlYXNlIGFkZCBhdCBsZWFzdCBvbmUgc3RhdGlvbiB0byB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9EUkFHX1QgICAgICA9ICdEcmFnZ2FibGUgc2VsZWN0aW9uIG9mIHN0YXRpb25zIGZvciB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9ERUxFVEUgICAgICA9ICdEcm9wIGhlcmUgdG8gZGVsZXRlJztcclxuICAgIFBfU0xfREVMRVRFX1QgICAgPSAnRHJvcCBzdGF0aW9uIGhlcmUgdG8gZGVsZXRlIGl0IGZyb20gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfSVRFTV9UICAgICAgPSAnRHJhZyB0byByZW9yZGVyOyBkb3VibGUtY2xpY2sgb3IgZHJhZyBpbnRvIGRlbGV0ZSB6b25lIHRvIHJlbW92ZSc7XHJcbiAgICBQX1RJTUVfVCAgICAgICAgID0gJ1RpbWUgZWRpdG9yJztcclxuXHJcbiAgICAvLyBTZXR0aW5nc1xyXG5cclxuICAgIFNUX1JFU0VUICAgICAgICAgICA9ICdSZXNldCB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9UICAgICAgICAgPSAnUmVzZXQgc2V0dGluZ3MgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfQ09ORklSTSAgID0gJ0FyZSB5b3Ugc3VyZT8nO1xyXG4gICAgU1RfUkVTRVRfQ09ORklSTV9UID0gJ0NvbmZpcm0gcmVzZXQgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfRE9ORSAgICAgID0gJ1NldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byB0aGVpciBkZWZhdWx0cywgYW5kIGRlbGV0ZWQgZnJvbScgK1xyXG4gICAgICAgICcgc3RvcmFnZS4nO1xyXG4gICAgU1RfU0FWRSAgICAgICAgICAgID0gJ1NhdmUgJiBjbG9zZSc7XHJcbiAgICBTVF9TQVZFX1QgICAgICAgICAgPSAnU2F2ZSBhbmQgY2xvc2Ugc2V0dGluZ3MnO1xyXG4gICAgU1RfU1BFRUNIICAgICAgICAgID0gJ1NwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfQ0hPSUNFICAgPSAnVm9pY2UnO1xyXG4gICAgU1RfU1BFRUNIX0VNUFRZICAgID0gJ05vbmUgYXZhaWxhYmxlJztcclxuICAgIFNUX1NQRUVDSF9WT0wgICAgICA9ICdWb2x1bWUnO1xyXG4gICAgU1RfU1BFRUNIX1BJVENIICAgID0gJ1BpdGNoJztcclxuICAgIFNUX1NQRUVDSF9SQVRFICAgICA9ICdSYXRlJztcclxuICAgIFNUX1NQRUVDSF9URVNUICAgICA9ICdUZXN0IHNwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfVEVTVF9UICAgPSAnUGxheSBhIHNwZWVjaCBzYW1wbGUgd2l0aCB0aGUgY3VycmVudCBzZXR0aW5ncyc7XHJcbiAgICBTVF9MRUdBTCAgICAgICAgICAgPSAnTGVnYWwgJiBBY2tub3dsZWRnZW1lbnRzJztcclxuXHJcbiAgICBXQVJOX1NIT1JUX0hFQURFUiA9ICdcIk1heSBJIGhhdmUgeW91ciBhdHRlbnRpb24gcGxlYXNlLi4uXCInO1xyXG4gICAgV0FSTl9TSE9SVCAgICAgICAgPSAnVGhpcyBkaXNwbGF5IGlzIHRvbyBzaG9ydCB0byBzdXBwb3J0IFJBRy4gUGxlYXNlIG1ha2UgdGhpcycgK1xyXG4gICAgICAgICcgd2luZG93IHRhbGxlciwgb3Igcm90YXRlIHlvdXIgZGV2aWNlIGZyb20gbGFuZHNjYXBlIHRvIHBvcnRyYWl0Lic7XHJcblxyXG4gICAgLy8gVE9ETzogVGhlc2UgZG9uJ3QgZml0IGhlcmU7IHRoaXMgc2hvdWxkIGdvIGluIHRoZSBkYXRhXHJcbiAgICBMRVRURVJTID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaJztcclxuICAgIERJR0lUUyAgPSBbXHJcbiAgICAgICAgJ3plcm8nLCAgICAgJ29uZScsICAgICAndHdvJywgICAgICd0aHJlZScsICAgICAnZm91cicsICAgICAnZml2ZScsICAgICdzaXgnLFxyXG4gICAgICAgICdzZXZlbicsICAgICdlaWdodCcsICAgJ25pbmUnLCAgICAndGVuJywgICAgICAgJ2VsZXZlbicsICAgJ3R3ZWx2ZScsICAndGhpcnRlZW4nLFxyXG4gICAgICAgICdmb3VydGVlbicsICdmaWZ0ZWVuJywgJ3NpeHRlZW4nLCAnc2V2ZW50ZWVuJywgJ2VpZ2h0ZWVuJywgJ25pbnRlZW4nLCAndHdlbnR5J1xyXG4gICAgXTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBIb2xkcyBtZXRob2RzIGZvciBwcm9jZXNzaW5nIGVhY2ggdHlwZSBvZiBwaHJhc2UgZWxlbWVudCBpbnRvIEhUTUwsIHdpdGggZGF0YSB0YWtlblxyXG4gKiBmcm9tIHRoZSBjdXJyZW50IHN0YXRlLiBFYWNoIG1ldGhvZCB0YWtlcyBhIGNvbnRleHQgb2JqZWN0LCBob2xkaW5nIGRhdGEgZm9yIHRoZVxyXG4gKiBjdXJyZW50IFhNTCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBhbmQgdGhlIFhNTCBkb2N1bWVudCBiZWluZyB1c2VkLlxyXG4gKi9cclxuY2xhc3MgRWxlbWVudFByb2Nlc3NvcnNcclxue1xyXG4gICAgLyoqIEZpbGxzIGluIGNvYWNoIGxldHRlcnMgZnJvbSBBIHRvIFogKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY29hY2goY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfQ09BQ0goY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0Q29hY2goY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgZXhjdXNlLCBmb3IgYSBkZWxheSBvciBjYW5jZWxsYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZXhjdXNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfRVhDVVNFO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIGludGVnZXJzLCBvcHRpb25hbGx5IHdpdGggbm91bnMgYW5kIGluIHdvcmQgZm9ybSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbnRlZ2VyKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IHNpbmd1bGFyID0gY3R4LnhtbEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdzaW5ndWxhcicpO1xyXG4gICAgICAgIGxldCBwbHVyYWwgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgncGx1cmFsJyk7XHJcbiAgICAgICAgbGV0IHdvcmRzICAgID0gY3R4LnhtbEVsZW1lbnQuZ2V0QXR0cmlidXRlKCd3b3JkcycpO1xyXG5cclxuICAgICAgICBsZXQgaW50ICAgID0gUkFHLnN0YXRlLmdldEludGVnZXIoY29udGV4dCk7XHJcbiAgICAgICAgbGV0IGludFN0ciA9ICh3b3JkcyAmJiB3b3Jkcy50b0xvd2VyQ2FzZSgpID09PSAndHJ1ZScpXHJcbiAgICAgICAgICAgID8gTC5ESUdJVFNbaW50XSB8fCBpbnQudG9TdHJpbmcoKVxyXG4gICAgICAgICAgICA6IGludC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICBpZiAgICAgIChpbnQgPT09IDEgJiYgc2luZ3VsYXIpXHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7c2luZ3VsYXJ9YDtcclxuICAgICAgICBlbHNlIGlmIChpbnQgIT09IDEgJiYgcGx1cmFsKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3BsdXJhbH1gO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfSU5URUdFUihjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IGludFN0cjtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcblxyXG4gICAgICAgIGlmIChzaW5ndWxhcikgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnc2luZ3VsYXInXSA9IHNpbmd1bGFyO1xyXG4gICAgICAgIGlmIChwbHVyYWwpICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsncGx1cmFsJ10gICA9IHBsdXJhbDtcclxuICAgICAgICBpZiAod29yZHMpICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3dvcmRzJ10gICAgPSB3b3JkcztcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5hbWVkKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfTkFNRUQ7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUubmFtZWQ7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBJbmNsdWRlcyBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2UsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2UgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlKHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgICAgID0gJyc7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsncmVmJ10gPSByZWY7XHJcblxyXG4gICAgICAgIGlmICghcGhyYXNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX1BIUkFTRShyZWYpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGhyYXNlcyB3aXRoIGEgY2hhbmNlIHZhbHVlIGFzIGNvbGxhcHNpYmxlXHJcbiAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQoIEVsZW1lbnRQcm9jZXNzb3JzLndyYXBUb0lubmVyKHBocmFzZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwaHJhc2UgZnJvbSBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2VzZXQsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZXNldChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcbiAgICAgICAgbGV0IGZvcmNlZElkeCA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnaWR4Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGlkeCA9IGZvcmNlZElkeFxyXG4gICAgICAgICAgICA/IHBhcnNlSW50KGZvcmNlZElkeClcclxuICAgICAgICAgICAgOiBSQUcuc3RhdGUuZ2V0UGhyYXNlc2V0SWR4KHJlZik7XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2UgPSBwaHJhc2VzZXQuY2hpbGRyZW5baWR4XSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnaWR4J10gPSBmb3JjZWRJZHggfHwgaWR4LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaHJhc2VzZXRzIHdpdGggYSBjaGFuY2UgdmFsdWUgYXMgY29sbGFwc2libGVcclxuICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5tYWtlQ29sbGFwc2libGUoY3R4LCByZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5hcHBlbmRDaGlsZCggRWxlbWVudFByb2Nlc3NvcnMud3JhcFRvSW5uZXIocGhyYXNlKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgY3VycmVudCBwbGF0Zm9ybSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwbGF0Zm9ybShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1BMQVRGT1JNO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gKFJBRy5zdGF0ZS5wbGF0Zm9ybVsxXSA9PT0gJ00nKVxyXG4gICAgICAgICAgICA/IFJBRy5zdGF0ZS5wbGF0Zm9ybVswXSArICfCvidcclxuICAgICAgICAgICAgOiBSQUcuc3RhdGUucGxhdGZvcm0uam9pbignJyk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgcmFpbCBuZXR3b3JrIG5hbWUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2VydmljZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TRVJWSUNFKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldFNlcnZpY2UoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIG5hbWVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb24oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBjb2RlICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb24oY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIGxpc3RzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb25saXN0KGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IHN0YXRpb25zICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGNvbnRleHQpLnNsaWNlKCk7XHJcbiAgICAgICAgbGV0IHN0YXRpb25MaXN0ID0gU3RyaW5ncy5mcm9tU3RhdGlvbkxpc3Qoc3RhdGlvbnMsIGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU1RBVElPTkxJU1QoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBzdGF0aW9uTGlzdDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSB0aW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRpbWUoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfVElNRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRUaW1lKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdm94IHBhcnRzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZveChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2tleScpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBMb2NhbGl6ZVxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ICAgID0gY3R4LnhtbEVsZW1lbnQudGV4dENvbnRlbnQ7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgICAgPSBgQ2xpY2sgdG8gZWRpdCB0aGlzIHBocmFzZSAoJHtrZXl9KWA7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgICAgPSAxO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2tleSddID0ga2V5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHVua25vd24gZWxlbWVudHMgd2l0aCBhbiBpbmxpbmUgZXJyb3IgbWVzc2FnZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB1bmtub3duKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZSA9IGN0eC54bWxFbGVtZW50Lm5vZGVOYW1lO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fRUxFTUVOVChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEF0dGFjaGVzIGNoYW5jZSBhbmQgYSBwcmUtZGV0ZXJtaW5lZCBjb2xsYXBzZSBzdGF0ZSBmb3IgYSBnaXZlbiBwaHJhc2UgZWxlbWVudCwgaWZcclxuICAgICAqIGl0IGRvZXMgaGF2ZSBhIGNoYW5jZSBhdHRyaWJ1ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY3R4IENvbnRleHQgb2YgdGhlIGN1cnJlbnQgcGhyYXNlIGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgKG9yIHBpY2spIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBtYWtlQ29sbGFwc2libGUoY3R4OiBQaHJhc2VDb250ZXh0LCByZWY6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhY3R4LnhtbEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGFuY2UnKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGNoYW5jZSAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnY2hhbmNlJykhO1xyXG4gICAgICAgIGxldCBjb2xsYXBzZWQgPSBSQUcuc3RhdGUuZ2V0Q29sbGFwc2VkKCByZWYsIHBhcnNlSW50KGNoYW5jZSkgKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY2hhbmNlJ10gPSBjaGFuY2U7XHJcblxyXG4gICAgICAgIENvbGxhcHNpYmxlcy5zZXQoY3R4Lm5ld0VsZW1lbnQsIGNvbGxhcHNlZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50IGludG8gYSBuZXcgaW5uZXIgc3BhbiB0YWcsIHNvIHRoYXQgdGhleVxyXG4gICAgICogY2FuIGJlIG1hZGUgY29sbGFwc2libGUgb3IgYnVuZGxlZCB3aXRoIGJ1dHRvbnMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNvdXJjZSBQYXJlbnQgdG8gY2xvbmUgdGhlIGNoaWxkcmVuIG9mLCBpbnRvIGEgd3JhcHBlclxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyB3cmFwVG9Jbm5lcihzb3VyY2U6IEhUTUxFbGVtZW50KSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGlubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cclxuICAgICAgICBpbm5lci5jbGFzc0xpc3QuYWRkKCdpbm5lcicpO1xyXG4gICAgICAgIERPTS5jbG9uZUludG8oc291cmNlLCBpbm5lcik7XHJcblxyXG4gICAgICAgIHJldHVybiBpbm5lcjtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGNvbnRleHQgZGF0YSBmb3IgYSBwaHJhc2UsIHRvIGJlIHBhc3NlZCB0byBhbiBlbGVtZW50IHByb2Nlc3NvciAqL1xyXG5pbnRlcmZhY2UgUGhyYXNlQ29udGV4dFxyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgWE1MIHBocmFzZSBlbGVtZW50IHRoYXQgaXMgYmVpbmcgcmVwbGFjZWQgKi9cclxuICAgIHhtbEVsZW1lbnQgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBIVE1MIHNwYW4gZWxlbWVudCB0aGF0IGlzIHJlcGxhY2luZyB0aGUgWE1MIGVsZW1lbnQgKi9cclxuICAgIG5ld0VsZW1lbnQgOiBIVE1MU3BhbkVsZW1lbnQ7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSGFuZGxlcyB0aGUgdHJhbnNmb3JtYXRpb24gb2YgcGhyYXNlIFhNTCBkYXRhLCBpbnRvIEhUTUwgZWxlbWVudHMgd2l0aCB0aGVpciBkYXRhXHJcbiAqIGZpbGxlZCBpbiBhbmQgdGhlaXIgVUkgbG9naWMgd2lyZWQuXHJcbiAqL1xyXG5jbGFzcyBQaHJhc2VyXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUmVjdXJzaXZlbHkgcHJvY2Vzc2VzIFhNTCBlbGVtZW50cywgZmlsbGluZyBpbiBkYXRhIGFuZCBhcHBseWluZyB0cmFuc2Zvcm1zLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250YWluZXIgUGFyZW50IHRvIHByb2Nlc3MgdGhlIGNoaWxkcmVuIG9mXHJcbiAgICAgKiBAcGFyYW0gbGV2ZWwgQ3VycmVudCBsZXZlbCBvZiByZWN1cnNpb24sIG1heC4gMjBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHByb2Nlc3MoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgbGV2ZWw6IG51bWJlciA9IDApXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSW5pdGlhbGx5LCB0aGlzIG1ldGhvZCB3YXMgc3VwcG9zZWQgdG8ganVzdCBhZGQgdGhlIFhNTCBlbGVtZW50cyBkaXJlY3RseSBpbnRvXHJcbiAgICAgICAgLy8gdGhlIGRvY3VtZW50LiBIb3dldmVyLCB0aGlzIGNhdXNlZCBhIGxvdCBvZiBwcm9ibGVtcyAoZS5nLiB0aXRsZSBub3Qgd29ya2luZykuXHJcbiAgICAgICAgLy8gSFRNTCBkb2VzIG5vdCB3b3JrIHJlYWxseSB3ZWxsIHdpdGggY3VzdG9tIGVsZW1lbnRzLCBlc3BlY2lhbGx5IGlmIHRoZXkgYXJlIG9mXHJcbiAgICAgICAgLy8gYW5vdGhlciBYTUwgbmFtZXNwYWNlLlxyXG5cclxuICAgICAgICBsZXQgcXVlcnkgICA9ICc6bm90KHNwYW4pOm5vdChzdmcpOm5vdCh1c2UpOm5vdChidXR0b24pJztcclxuICAgICAgICBsZXQgcGVuZGluZyA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKHF1ZXJ5KSBhcyBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxuXHJcbiAgICAgICAgLy8gTm8gbW9yZSBYTUwgZWxlbWVudHMgdG8gZXhwYW5kXHJcbiAgICAgICAgaWYgKHBlbmRpbmcubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIFhNTCBlbGVtZW50IGN1cnJlbnRseSBpbiB0aGUgY29udGFpbmVyOlxyXG4gICAgICAgIC8vICogQ3JlYXRlIGEgbmV3IHNwYW4gZWxlbWVudCBmb3IgaXRcclxuICAgICAgICAvLyAqIEhhdmUgdGhlIHByb2Nlc3NvcnMgdGFrZSBkYXRhIGZyb20gdGhlIFhNTCBlbGVtZW50LCB0byBwb3B1bGF0ZSB0aGUgbmV3IG9uZVxyXG4gICAgICAgIC8vICogUmVwbGFjZSB0aGUgWE1MIGVsZW1lbnQgd2l0aCB0aGUgbmV3IG9uZVxyXG4gICAgICAgIHBlbmRpbmcuZm9yRWFjaChlbGVtZW50ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudE5hbWUgPSBlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICAgICAgbGV0IGNvbnRleHQgICAgID0ge1xyXG4gICAgICAgICAgICAgICAgeG1sRWxlbWVudDogZWxlbWVudCxcclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQ6IG5ld0VsZW1lbnRcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIG5ld0VsZW1lbnQuZGF0YXNldFsndHlwZSddID0gZWxlbWVudE5hbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBJIHdhbnRlZCB0byB1c2UgYW4gaW5kZXggb24gRWxlbWVudFByb2Nlc3NvcnMgZm9yIHRoaXMsIGJ1dCBpdCBjYXVzZWQgZXZlcnlcclxuICAgICAgICAgICAgLy8gcHJvY2Vzc29yIHRvIGhhdmUgYW4gXCJ1bnVzZWQgbWV0aG9kXCIgd2FybmluZy5cclxuICAgICAgICAgICAgc3dpdGNoIChlbGVtZW50TmFtZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnY29hY2gnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5jb2FjaChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLmV4Y3VzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuaW50ZWdlcihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5uYW1lZChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BocmFzZXNldCc6ICAgRWxlbWVudFByb2Nlc3NvcnMucGhyYXNlc2V0KGNvbnRleHQpOyAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICBFbGVtZW50UHJvY2Vzc29ycy5wbGF0Zm9ybShjb250ZXh0KTsgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnNlcnZpY2UoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb24nOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhdGlvbmxpc3QnOiBFbGVtZW50UHJvY2Vzc29ycy5zdGF0aW9ubGlzdChjb250ZXh0KTsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnRpbWUoY29udGV4dCk7ICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudm94KGNvbnRleHQpOyAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogICAgICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy51bmtub3duKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGVsZW1lbnQucGFyZW50RWxlbWVudCEucmVwbGFjZUNoaWxkKG5ld0VsZW1lbnQsIGVsZW1lbnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBSZWN1cnNlIHNvIHRoYXQgd2UgY2FuIGV4cGFuZCBhbnkgbmV3IGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKGxldmVsIDwgMjApXHJcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250YWluZXIsIGxldmVsICsgMSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcihMLlBIUkFTRVJfVE9PX1JFQ1VSU0lWRSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXG5cbmludGVyZmFjZSBTY2VuYXJpb1N0ZXBcbntcbiAgICB0eXBlOiAnYW5ub3VuY2VtZW50JyB8ICd3YWl0JztcbiAgICBzdGF0ZUpzb24/OiBzdHJpbmc7XG4gICAgZ2FwTXM6IG51bWJlcjtcbiAgICB3YWl0U2Vjb25kcz86IG51bWJlcjtcbn1cblxuY2xhc3MgU2NlbmFyaW9cbntcbiAgICBwcml2YXRlIHN0ZXBzOiBTY2VuYXJpb1N0ZXBbXSA9IFtdO1xuICAgIHByaXZhdGUgY3VycmVudEluZGV4OiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgcnVubmluZzogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgcGF1c2VkOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSB0aW1lcjogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIHdhaXRJbnRlcnZhbDogbnVtYmVyID0gMDtcbiAgICAvKiogV2hlbiB0cnVlLCB0aGUgc2NlbmFyaW8gc3RvcHMgcmlnaHQgYWZ0ZXIgdGhlIGN1cnJlbnQgc3RlcCAoc2luZ2xlLXN0ZXAgcGxheSkgKi9cbiAgICBwcml2YXRlIHN0b3BBZnRlclN0ZXA6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAvKiogU2FmZXR5IHRpbWVyOiBhZHZhbmNlcyB0aGUgc3RlcCBldmVuIGlmIHRoZSBzcGVlY2ggZW5naW5lIG5ldmVyIHNpZ25hbHMgY29tcGxldGlvbiAqL1xuICAgIHByaXZhdGUgd2F0Y2hkb2c6IG51bWJlciA9IDA7XG4gICAgLyoqIEd1YXJkIHNvIGEgc3RlcCBjb21wbGV0ZXMgKHNwZWVjaCBlbmQgb3Igd2F0Y2hkb2cpIGFuZCBhZHZhbmNlcyBleGFjdGx5IG9uY2UgKi9cbiAgICBwcml2YXRlIHN0ZXBGaW5pc2hlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgbG9vcENvdW50OiBudW1iZXIgPSAxO1xuICAgIHByaXZhdGUgbG9vcHNEb25lOiBudW1iZXIgPSAwO1xuXG4gICAgcHVibGljIG9uU3RlcD86IChpZHg6IG51bWJlciwgdG90YWw6IG51bWJlciwgc3RlcDogU2NlbmFyaW9TdGVwKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBvbldhaXRDb3VudGRvd24/OiAocmVtYWluaW5nOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWQ7XG4gICAgcHVibGljIG9uQ29tcGxldGU/OiAoKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBvbkVycm9yPzogKG1zZzogc3RyaW5nKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBvblRleHRVcGRhdGU/OiAodGV4dDogc3RyaW5nKSA9PiB2b2lkO1xuXG4gICAgcHVibGljIHNldFN0ZXBzKHN0ZXBzOiBTY2VuYXJpb1N0ZXBbXSk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc3RlcHMgPSBzdGVwcztcbiAgICAgICAgdGhpcy5jdXJyZW50SW5kZXggPSAwO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRTdGVwKHN0YXRlSnNvbjogc3RyaW5nLCBnYXBNczogbnVtYmVyID0gMTUwMCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc3RlcHMucHVzaCh7IHR5cGU6ICdhbm5vdW5jZW1lbnQnLCBzdGF0ZUpzb24sIGdhcE1zIH0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRMb29wQ291bnQobjogbnVtYmVyKTogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5sb29wQ291bnQgPSBNYXRoLm1heCgxLCBuKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0IHN0ZXBDb3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5zdGVwcy5sZW5ndGg7IH1cbiAgICBwdWJsaWMgZ2V0IGlzUnVubmluZygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMucnVubmluZzsgfVxuICAgIHB1YmxpYyBnZXQgaXNQYXVzZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnBhdXNlZDsgfVxuICAgIHB1YmxpYyBleHBvcnRKc29uKCk6IHZvaWQgeyAvKiBuby1vcDsgZGFzaGJvYXJkIGhhbmRsZXMgZXhwb3J0ICovIH1cbiAgICBwdWJsaWMgZ2V0IGN1cnJlbnRMb29wVmFsdWUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubG9vcHNEb25lICsgMTsgfVxuICAgIHB1YmxpYyBnZXQgdG90YWxMb29wc1ZhbHVlKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmxvb3BDb3VudDsgfVxuXG4gICAgcHVibGljIGNsZWFyKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICB0aGlzLnN0ZXBzID0gW107XG4gICAgICAgIHRoaXMuY3VycmVudEluZGV4ID0gMDtcbiAgICB9XG5cbiAgICBwdWJsaWMgcGxheSgpOiB2b2lkXG4gICAge1xuICAgICAgICBpZiAodGhpcy5zdGVwcy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICAgICAgaWYgKHRoaXMucGF1c2VkKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnBhdXNlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMucnVuU3RlcCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICB0aGlzLnJ1bm5pbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLnBhdXNlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmN1cnJlbnRJbmRleCA9IDA7XG4gICAgICAgIHRoaXMubG9vcHNEb25lID0gMDtcbiAgICAgICAgdGhpcy5zdG9wQWZ0ZXJTdGVwID0gZmFsc2U7XG4gICAgICAgIHRoaXMucnVuU3RlcCgpO1xuICAgIH1cblxuICAgIC8qKiBQbGF5cyBleGFjdGx5IG9uZSBzdGVwIChpdHMgYW5ub3VuY2VtZW50LCBvciBpdHMgd2FpdCksIHRoZW4gc3RvcHMgKi9cbiAgICBwdWJsaWMgcGxheVN0ZXAoaWR4OiBudW1iZXIpOiB2b2lkXG4gICAge1xuICAgICAgICBpZiAoaWR4IDwgMCB8fCBpZHggPj0gdGhpcy5zdGVwcy5sZW5ndGgpIHJldHVybjtcblxuICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5jdXJyZW50SW5kZXggPSBpZHg7XG4gICAgICAgIHRoaXMubG9vcHNEb25lID0gMDtcbiAgICAgICAgdGhpcy5sb29wQ291bnQgPSAxO1xuICAgICAgICB0aGlzLnN0b3BBZnRlclN0ZXAgPSB0cnVlO1xuICAgICAgICB0aGlzLnJ1blN0ZXAoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgcGF1c2UoKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICAgICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMucGF1c2VkICA9IHRydWU7XG5cbiAgICAgICAgLy8gU3RvcCBzcGVlY2ggZmlyc3Q6IGl0IG1heSByZS1maXJlIG9uc3RvcCwgd2hpY2ggY291bGQgc2NoZWR1bGUgYVxuICAgICAgICAvLyBwZW5kaW5nIGFkdmFuY2U7IGNsZWFyIGFsbCB0aW1lcnMgYWZ0ZXJ3YXJkcyBzbyBub3RoaW5nIHN1cnZpdmVzLlxuICAgICAgICBpZiAodHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnNwZWVjaCkgUkFHLnNwZWVjaC5zdG9wKCk7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKTtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMud2F0Y2hkb2cpO1xuICAgICAgICBjbGVhckludGVydmFsKHRoaXMud2FpdEludGVydmFsKTtcbiAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1NUT1BfUExBWUJBQ0snKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3RvcCgpOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5wYXVzZWQgID0gZmFsc2U7XG5cbiAgICAgICAgLy8gU3RvcCBzcGVlY2ggZmlyc3QgKHNlZSBwYXVzZSkgc28gYSByZS1maXJlZCBvbnN0b3AgY2FuJ3QgbGVhdmUgYVxuICAgICAgICAvLyBwZW5kaW5nIGFkdmFuY2UgdGltZXIgYmVoaW5kIHRoaXMgY2xlYXIuXG4gICAgICAgIGlmICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcuc3BlZWNoKSBSQUcuc3BlZWNoLnN0b3AoKTtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZXIpO1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy53YXRjaGRvZyk7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy53YWl0SW50ZXJ2YWwpO1xuICAgICAgICB0aGlzLnN0ZXBGaW5pc2hlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnN0b3BBZnRlclN0ZXAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1NUT1BfUExBWUJBQ0snKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJ1blN0ZXAoKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy5jdXJyZW50SW5kZXggPj0gdGhpcy5zdGVwcy5sZW5ndGgpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMubG9vcHNEb25lKys7XG4gICAgICAgICAgICBpZiAodGhpcy5sb29wc0RvbmUgPCB0aGlzLmxvb3BDb3VudClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5ydW5TdGVwKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnBhdXNlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1NUT1BfUExBWUJBQ0snKTtcbiAgICAgICAgICAgIGlmICh0aGlzLm9uQ29tcGxldGUpIHRoaXMub25Db21wbGV0ZSgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHN0ZXAgPSB0aGlzLnN0ZXBzW3RoaXMuY3VycmVudEluZGV4XTtcbiAgICAgICAgaWYgKHRoaXMub25TdGVwKSB0aGlzLm9uU3RlcCh0aGlzLmN1cnJlbnRJbmRleCwgdGhpcy5zdGVwcy5sZW5ndGgsIHN0ZXApO1xuXG4gICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICd3YWl0JylcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IHRvdGFsID0gc3RlcC53YWl0U2Vjb25kcyB8fCAwO1xuICAgICAgICAgICAgbGV0IHJlbWFpbmluZyA9IHRvdGFsO1xuICAgICAgICAgICAgbGV0IHdhaXRUZXh0ID0gYFdhaXRpbmcgJHtyZW1haW5pbmd9cy4uLmA7XG4gICAgICAgICAgICBpZiAodGhpcy5vblRleHRVcGRhdGUpIHRoaXMub25UZXh0VXBkYXRlKHdhaXRUZXh0KTtcbiAgICAgICAgICAgIGlmICh0aGlzLm9uV2FpdENvdW50ZG93bikgdGhpcy5vbldhaXRDb3VudGRvd24ocmVtYWluaW5nLCB0b3RhbCk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnZpZXdzICYmIFJBRy52aWV3cy5tYXJxdWVlKSBSQUcudmlld3MubWFycXVlZS5zZXQod2FpdFRleHQpO1xuICAgICAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1dBSVRfQ09VTlRET1dOJywgeyByZW1haW5pbmdTZWNvbmRzOiByZW1haW5pbmcsIHRvdGFsU2Vjb25kczogdG90YWwgfSk7XG5cbiAgICAgICAgICAgIHRoaXMud2FpdEludGVydmFsID0gd2luZG93LnNldEludGVydmFsKCgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVtYWluaW5nLS07XG4gICAgICAgICAgICAgICAgaWYgKHJlbWFpbmluZyA8PSAwKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLndhaXRJbnRlcnZhbCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGV0IHR4dCA9IGBXYWl0aW5nICR7cmVtYWluaW5nfXMuLi5gO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLm9uVGV4dFVwZGF0ZSkgdGhpcy5vblRleHRVcGRhdGUodHh0KTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vbldhaXRDb3VudGRvd24pIHRoaXMub25XYWl0Q291bnRkb3duKHJlbWFpbmluZywgdG90YWwpO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcudmlld3MgJiYgUkFHLnZpZXdzLm1hcnF1ZWUpIFJBRy52aWV3cy5tYXJxdWVlLnNldCh0eHQpO1xuICAgICAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0KCdXQUlUX0NPVU5URE9XTicsIHsgcmVtYWluaW5nU2Vjb25kczogcmVtYWluaW5nLCB0b3RhbFNlY29uZHM6IHRvdGFsIH0pO1xuICAgICAgICAgICAgfSwgMTAwMCk7XG5cbiAgICAgICAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy53YWl0SW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIHRoaXMuYWR2YW5jZSgpO1xuICAgICAgICAgICAgfSwgdG90YWwgKiAxMDAwKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFubm91bmNlbWVudCBzdGVwXG4gICAgICAgIHRyeVxuICAgICAgICB7XG4gICAgICAgICAgICBpZiAoc3RlcC5zdGF0ZUpzb24gJiYgdHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLmxvYWQpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgUkFHLmxvYWQoc3RlcC5zdGF0ZUpzb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlKVxuICAgICAgICB7XG4gICAgICAgICAgICBpZiAodGhpcy5vbkVycm9yKSB0aGlzLm9uRXJyb3IoJ0ZhaWxlZCB0byBsb2FkIHN0ZXAgc3RhdGU6ICcgKyBlKTtcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHRleHQgPSAodHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnZpZXdzICYmIFJBRy52aWV3cy5lZGl0b3IpID8gUkFHLnZpZXdzLmVkaXRvci5nZXRUZXh0KCkgOiAnUGxheWluZyBzdGVwLi4uJztcbiAgICAgICAgaWYgKHRoaXMub25UZXh0VXBkYXRlKSB0aGlzLm9uVGV4dFVwZGF0ZSh0ZXh0KTtcbiAgICAgICAgaWYgKHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy52aWV3cyAmJiBSQUcudmlld3MubWFycXVlZSkgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KHRleHQpO1xuICAgICAgICB0aGlzLmJyb2FkY2FzdCgnUExBWV9TQ0VOQVJJT19TVEVQJywgeyBpbmRleDogdGhpcy5jdXJyZW50SW5kZXgsIHRleHQ6IHRleHQgfSk7XG5cbiAgICAgICAgbGV0IHBocmFzZUVsID0gKHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy52aWV3cyAmJiBSQUcudmlld3MuZWRpdG9yKSA/IFJBRy52aWV3cy5lZGl0b3IuZ2V0UGhyYXNlKCkgOiBudWxsO1xuICAgICAgICBpZiAocGhyYXNlRWwgJiYgdHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnNwZWVjaClcbiAgICAgICAge1xuICAgICAgICAgICAgLy8gUmVzZXQgdGhlIHBlci1zdGVwIGd1YXJkLCB0aGVuIGFybSBib3RoIHRoZSBub3JtYWwgcGF0aCAoc3BlZWNoXG4gICAgICAgICAgICAvLyBzaWduYWxzIGNvbXBsZXRpb24pIGFuZCBhIHdhdGNoZG9nIGluIGNhc2UgdGhlIGVuZ2luZSBuZXZlciBkb2VzLlxuICAgICAgICAgICAgdGhpcy5zdGVwRmluaXNoZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgUkFHLnNwZWVjaC5vbnNwZWFrID0gKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgY3VycmVudFRleHQgPSBSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vblRleHRVcGRhdGUpIHRoaXMub25UZXh0VXBkYXRlKGN1cnJlbnRUZXh0KTtcbiAgICAgICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoY3VycmVudFRleHQpO1xuICAgICAgICAgICAgICAgIFJBRy5zcGVlY2gub25zcGVhayA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIFJBRy5zcGVlY2gub25zdG9wID0gKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbmlzaFN0ZXAoc3RlcC5nYXBNcyk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBXYXRjaGRvZzogYSBiYWNrc3RvcCBmb3IgYSBzcGVlY2ggZW5naW5lIHRoYXQgbmV2ZXIgc2lnbmFsc1xuICAgICAgICAgICAgLy8gY29tcGxldGlvbi4gVk9YIGFubm91bmNlbWVudHMgcnVuIGxvbmdlciB0aGFuIHRoZSB0ZXh0LWxlbmd0aFxuICAgICAgICAgICAgLy8gZXN0aW1hdGUgKGNsaXBzIHBsdXMgcGF1c2VzKSwgc28gd2hlbiB0aGUgd2F0Y2hkb2cgZmlyZXMgdGhlXG4gICAgICAgICAgICAvLyBlbmdpbmUgbWF5IHN0aWxsIGJlIHBsYXlpbmcgcmVhbCBhdWRpbzogZXh0ZW5kIGEgZmV3IHRpbWVzIGluXG4gICAgICAgICAgICAvLyB0aGF0IGNhc2UgaW5zdGVhZCBvZiBjdXR0aW5nIHRoZSBhbm5vdW5jZW1lbnQgc2hvcnQuIFRoZSBib3VuZGVkXG4gICAgICAgICAgICAvLyByZS1hcm1zIGtlZXAgYSBodW5nIGVuZ2luZSBmcm9tIHN0YWxsaW5nIHRoZSBzY2VuYXJpbyBmb3JldmVyLlxuICAgICAgICAgICAgbGV0IHJlYXJtTGVmdCA9IDM7XG4gICAgICAgICAgICBsZXQgYXJtV2F0Y2hkb2cgPSAobXM6IG51bWJlcikgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy53YXRjaGRvZyk7XG4gICAgICAgICAgICAgICAgdGhpcy53YXRjaGRvZyA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+XG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBsZXQgc3BlYWtpbmcgPSAodHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnNwZWVjaCkgPyBSQUcuc3BlZWNoLmlzU3BlYWtpbmcgOiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNwZWFraW5nICYmIHJlYXJtTGVmdCA+IDApXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlYXJtTGVmdC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJtV2F0Y2hkb2coMzAwMDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmluaXNoU3RlcChzdGVwLmdhcE1zKTtcbiAgICAgICAgICAgICAgICB9LCBtcyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgbGV0IHdhdGNoZG9nTXMgPSBNYXRoLm1pbig2MDAwMCwgTWF0aC5tYXgoNjAwMCwgdGV4dC5sZW5ndGggKiA5MCkpO1xuICAgICAgICAgICAgYXJtV2F0Y2hkb2cod2F0Y2hkb2dNcyk7XG5cbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3BlYWsocGhyYXNlRWwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5zdGVwRmluaXNoZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMuYWR2YW5jZSgpO1xuICAgICAgICAgICAgfSwgc3RlcC5nYXBNcyB8fCAxNTAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbXBsZXRlcyB0aGUgY3VycmVudCBzdGVwIGV4YWN0bHkgb25jZSwgd2hldGhlciBpdCBlbmRlZCBiZWNhdXNlIHRoZVxuICAgICAqIHNwZWVjaCBlbmdpbmUgc2lnbmFsbGVkIGNvbXBsZXRpb24gb3IgYmVjYXVzZSB0aGUgd2F0Y2hkb2cgZmlyZWQuIFNhZmVcbiAgICAgKiBhZ2FpbnN0IHRoZSByZS1lbnRyYW50IG9uc3RvcCB0aGF0IHNwZWVjaC5zdG9wKCkgY2FuIHRyaWdnZXI6IHRoZVxuICAgICAqIHN0ZXBGaW5pc2hlZCBndWFyZCBpcyBzZXQgYmVmb3JlIHNwZWVjaCBpcyBzdG9wcGVkLlxuICAgICAqL1xuICAgIHByaXZhdGUgZmluaXNoU3RlcChnYXBNczogbnVtYmVyKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKHRoaXMuc3RlcEZpbmlzaGVkKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB0aGlzLnN0ZXBGaW5pc2hlZCA9IHRydWU7XG5cbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMud2F0Y2hkb2cpO1xuICAgICAgICBpZiAodHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnNwZWVjaClcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xuXG4gICAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLmFkdmFuY2UoKTtcbiAgICAgICAgfSwgZ2FwTXMgfHwgMCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhZHZhbmNlKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG5cbiAgICAgICAgLy8gXCJQbGF5IG9uZSBzdGVwXCIgbW9kZTogdGhpcyBzdGVwIHdhcyB0aGUgb25seSBvbmUgYXNrZWQgZm9yLCBzb1xuICAgICAgICAvLyBmaW5pc2ggdGhlIHJ1biBoZXJlLlxuICAgICAgICBpZiAodGhpcy5zdG9wQWZ0ZXJTdGVwKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnN0b3BBZnRlclN0ZXAgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0KCdTVE9QX1BMQVlCQUNLJyk7XG4gICAgICAgICAgICBpZiAodGhpcy5vbkNvbXBsZXRlKSB0aGlzLm9uQ29tcGxldGUoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY3VycmVudEluZGV4Kys7XG4gICAgICAgIHRoaXMucnVuU3RlcCgpO1xuICAgIH1cblxuICAgIC8qKiBCcm9hZGNhc3QgYSBwbGF5YmFjayBldmVudCB0byB0aGUgb3RoZXIgdGFicyAodGhlIGVkaXRvciBtaXJyb3JzIGl0LCBkaXNwbGF5LW9ubHkpICovXG4gICAgcHJpdmF0ZSBicm9hZGNhc3QodHlwZTogc3RyaW5nLCBwYXlsb2FkPzogYW55KTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy5jaGFubmVsKVxuICAgICAgICAgICAgUkFHLmNoYW5uZWwuc2VuZCh0eXBlLCBwYXlsb2FkIHx8IHt9KTtcbiAgICB9XG59XG5cbih3aW5kb3cgYXMgYW55KS5TY2VuYXJpbyA9IFNjZW5hcmlvO1xuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIHJlc29sdmluZyBhIGdpdmVuIHBocmFzZSB0byB2b3gga2V5cyAqL1xyXG5jbGFzcyBSZXNvbHZlclxyXG57XHJcbiAgICAvKiogVHJlZVdhbGtlciBmaWx0ZXIgdG8gcmVkdWNlIGEgd2FsayB0byBqdXN0IHRoZSBlbGVtZW50cyB0aGUgcmVzb2x2ZXIgbmVlZHMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSk6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcGFyZW50VHlwZSA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghcGFyZW50VHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCAgICAgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWNjZXB0IHRleHQgb25seSBmcm9tIHBocmFzZSBhbmQgcGhyYXNlc2V0c1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICBpZiAocGFyZW50VHlwZSAhPT0gJ3BocmFzZXNldCcgJiYgcGFyZW50VHlwZSAhPT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgICAgICAvLyBSZWplY3QgY29sbGFwc2VkIGVsZW1lbnRzIGFuZCB0aGVpciBjaGlsZHJlblxyXG4gICAgICAgICAgICBpZiAoIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCB0eXBlbGVzcyAod3JhcHBlcikgZWxlbWVudHNcclxuICAgICAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIG92ZXIgcGhyYXNlIGFuZCBwaHJhc2VzZXRzIChpbnN0ZWFkLCBvbmx5IGdvaW5nIGZvciB0aGVpciBjaGlsZHJlbilcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnIHx8IHR5cGUgPT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGhyYXNlICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHJpdmF0ZSBmbGF0dGVuZWQgOiBOb2RlW107XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlZCAgOiBWb3hLZXlbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGhyYXNlOiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnBocmFzZSAgICA9IHBocmFzZTtcclxuICAgICAgICB0aGlzLmZsYXR0ZW5lZCA9IFtdO1xyXG4gICAgICAgIHRoaXMucmVzb2x2ZWQgID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHRvVm94KCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIC8vIEZpcnN0LCB3YWxrIHRocm91Z2ggdGhlIHBocmFzZSBhbmQgXCJmbGF0dGVuXCIgaXQgaW50byBhbiBhcnJheSBvZiBwYXJ0cy4gVGhpcyBpc1xyXG4gICAgICAgIC8vIHNvIHRoZSByZXNvbHZlciBjYW4gbG9vay1haGVhZCBvciBsb29rLWJlaGluZC5cclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgICAgIGxldCB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgdGhpcy5waHJhc2UsXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19URVhUIHwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogUmVzb2x2ZXIubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggdHJlZVdhbGtlci5uZXh0Tm9kZSgpIClcclxuICAgICAgICBpZiAodHJlZVdhbGtlci5jdXJyZW50Tm9kZS50ZXh0Q29udGVudCEudHJpbSgpICE9PSAnJylcclxuICAgICAgICAgICAgdGhpcy5mbGF0dGVuZWQucHVzaCh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVzb2x2ZSBhbGwgdGhlIHBocmFzZXMnIG5vZGVzIGludG8gdm94IGtleXNcclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQuZm9yRWFjaCggKHYsIGkpID0+IHRoaXMucmVzb2x2ZWQucHVzaCggLi4udGhpcy5yZXNvbHZlKHYsIGkpICkgKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5mbGF0dGVuZWQsIHRoaXMucmVzb2x2ZWQpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXNlcyB0aGUgdHlwZSBhbmQgdmFsdWUgb2YgdGhlIGdpdmVuIG5vZGUsIHRvIHJlc29sdmUgaXQgdG8gdm94IGZpbGUgSURzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBub2RlIE5vZGUgdG8gcmVzb2x2ZSB0byB2b3ggSURzXHJcbiAgICAgKiBAcGFyYW0gaWR4IEluZGV4IG9mIHRoZSBub2RlIGJlaW5nIHJlc29sdmVkIHJlbGF0aXZlIHRvIHRoZSBwaHJhc2UgYXJyYXlcclxuICAgICAqIEByZXR1cm5zIEFycmF5IG9mIElEcyB0aGF0IG1ha2UgdXAgb25lIG9yIG1vcmUgZmlsZSBJRHMuIENhbiBiZSBlbXB0eS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlKG5vZGU6IE5vZGUsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGV4dChub2RlKTtcclxuXHJcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUNvYWNoKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2V4Y3VzZSc6ICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUV4Y3VzZShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVJbnRlZ2VyKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICduYW1lZCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVOYW1lZCgpO1xyXG4gICAgICAgICAgICBjYXNlICdwbGF0Zm9ybSc6ICAgIHJldHVybiB0aGlzLnJlc29sdmVQbGF0Zm9ybShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTZXJ2aWNlKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3RpbWUnOiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRpbWUoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVZveChlbGVtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEluZmxlY3Rpb24oaWR4OiBudW1iZXIpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgPSB0aGlzLmZsYXR0ZW5lZFtpZHggKyAxXTtcclxuXHJcbiAgICAgICAgcmV0dXJuICggbmV4dCAmJiBuZXh0LnRleHRDb250ZW50IS50cmltKCkuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgPyAnZW5kJ1xyXG4gICAgICAgICAgICA6ICdtaWQnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRleHQobm9kZTogTm9kZSkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBub2RlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBTdHJpbmdzLmNsZWFuKG5vZGUudGV4dENvbnRlbnQhKTtcclxuICAgICAgICBsZXQgc2V0ICAgID0gW107XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgaXMganVzdCBhIGZ1bGwgc3RvcCwgcmV0dXJuIHNpbGVuY2VcclxuICAgICAgICBpZiAodGV4dCA9PT0gJy4nKVxyXG4gICAgICAgICAgICByZXR1cm4gWzAuNjVdO1xyXG5cclxuICAgICAgICAvLyBJZiBpdCBiZWdpbnMgd2l0aCBhIGZ1bGwgc3RvcCwgYWRkIHNpbGVuY2VcclxuICAgICAgICBpZiAoIHRleHQuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0ZXh0IGRvZXNuJ3QgY29udGFpbiBhbnkgd29yZHMsIHNraXBcclxuICAgICAgICBpZiAoICF0ZXh0Lm1hdGNoKC9bYS16MC05XS9pKSApXHJcbiAgICAgICAgICAgIHJldHVybiBzZXQ7XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCByZWYgPSBwYXJlbnQuZGF0YXNldFsncmVmJ107XHJcbiAgICAgICAgbGV0IGlkeCA9IERPTS5ub2RlSW5kZXhPZihub2RlKTtcclxuICAgICAgICBsZXQgaWQgID0gYCR7dHlwZX0uJHtyZWZ9YDtcclxuXHJcbiAgICAgICAgLy8gQXBwZW5kIGluZGV4IG9mIHBocmFzZXNldCdzIGNob2ljZSBvZiBwaHJhc2VcclxuICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZXNldCcpXHJcbiAgICAgICAgICAgIGlkICs9IGAuJHtwYXJlbnQuZGF0YXNldFsnaWR4J119YDtcclxuXHJcbiAgICAgICAgaWQgKz0gYC4ke2lkeH1gO1xyXG4gICAgICAgIHNldC5wdXNoKGlkKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGV4dCBlbmRzIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LmVuZHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICBzZXQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHNldDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVDb2FjaChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgY29hY2ggICA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgPSBbMC4yLCBgbGV0dGVyLiR7Y29hY2h9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUV4Y3VzZShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBleGN1c2UgID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgICAgICBsZXQga2V5ICAgICA9IFN0cmluZ3MuZmlsZW5hbWUoZXhjdXNlKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMTUsIGBleGN1c2UuJHtrZXl9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUludGVnZXIoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHNpbmd1bGFyID0gZWxlbWVudC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIGxldCBwbHVyYWwgICA9IGVsZW1lbnQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgbGV0IGludGVnZXIgID0gUkFHLnN0YXRlLmdldEludGVnZXIoY3R4KTtcclxuICAgICAgICBsZXQgcGFydHMgICAgPSBbMC4xMjUsIGBudW1iZXIuJHtpbnRlZ2VyfS5taWRgXTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoc2luZ3VsYXIgJiYgaW50ZWdlciA9PT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjE1LCBgbnVtYmVyLnN1ZmZpeC4ke3Npbmd1bGFyfS5lbmRgKTtcclxuICAgICAgICBlbHNlIGlmIChwbHVyYWwgICAmJiBpbnRlZ2VyICE9PSAxKVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMTUsIGBudW1iZXIuc3VmZml4LiR7cGx1cmFsfS5lbmRgKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVOYW1lZCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZWQgPSBTdHJpbmdzLmZpbGVuYW1lKFJBRy5zdGF0ZS5uYW1lZCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbMC4yLCBgbmFtZWQuJHtuYW1lZH0ubWlkYCwgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVQbGF0Zm9ybShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuICAgICAgICBsZXQgaW5mbGVjdCAgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgbGV0dGVyICAgPSAocGxhdGZvcm1bMV0gPT09ICfCvicpID8gJ00nIDogcGxhdGZvcm1bMV07XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgID0gWzAuMTUsIGBudW1iZXIuJHtwbGF0Zm9ybVswXX0ke2xldHRlcn0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU2VydmljZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzZXJ2aWNlID0gU3RyaW5ncy5maWxlbmFtZSggUkFHLnN0YXRlLmdldFNlcnZpY2UoY3R4KSApO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gW107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgYWRkIGJlZ2lubmluZyBkZWxheSBpZiB0aGVyZSBpc24ndCBhbHJlYWR5IG9uZSBwcmlvclxyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5yZXNvbHZlZC5zbGljZSgtMSlbMF0gIT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjE1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5yZXN1bHQsIGBzZXJ2aWNlLiR7c2VydmljZX0ubWlkYCwgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU3RhdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGN0eCk7XHJcbiAgICAgICAgbGV0IHZveEtleSAgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvblZveChzdGF0aW9uKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMiwgYHN0YXRpb24uJHt2b3hLZXl9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBsaXN0ICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgbGlzdC5mb3JFYWNoKCAoY29kZSwgaykgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCB2b3hLZXkgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvblZveChjb2RlKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBtaWRkbGUgb2YgbGlzdCBpbmZsZWN0aW9uXHJcbiAgICAgICAgICAgIGlmIChrICE9PSBsaXN0Lmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9Lm1pZGAsIDAuMjUpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBBZGQgXCJhbmRcIiBpZiBsaXN0IGhhcyBtb3JlIHRoYW4gMSBzdGF0aW9uIGFuZCB0aGlzIGlzIHRoZSBlbmRcclxuICAgICAgICAgICAgaWYgKGxpc3QubGVuZ3RoID4gMSlcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goJ3N0YXRpb24ucGFydHMuYW5kLm1pZCcsIDAuMjUpO1xyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwib25seVwiIGlmIG9ubHkgb25lIHN0YXRpb24gaW4gdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgICAgICBpZiAobGlzdC5sZW5ndGggPT09IDEgJiYgY3R4ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9Lm1pZGApO1xyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsICdzdGF0aW9uLnBhcnRzLm9ubHkuZW5kJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgc3RhdGlvbi4ke3ZveEtleX0uJHtpbmZsZWN0fWApO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAwLjJdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRpbWUoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHRpbWUgID0gUkFHLnN0YXRlLmdldFRpbWUoY3R4KS5zcGxpdCgnOicpO1xyXG5cclxuICAgICAgICBsZXQgcGFydHMgOiBWb3hLZXlbXSA9IFswLjJdO1xyXG5cclxuICAgICAgICBpZiAodGltZVswXSA9PT0gJzAwJyAmJiB0aW1lWzFdID09PSAnMDAnKVxyXG4gICAgICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAnbnVtYmVyLjAwMDAubWlkJywgMC4yXTtcclxuXHJcbiAgICAgICAgLy8gSG91cnNcclxuICAgICAgICBwYXJ0cy5wdXNoKGBudW1iZXIuJHt0aW1lWzBdfS5iZWdpbmApO1xyXG5cclxuICAgICAgICBpZiAodGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjA3NSwgJ251bWJlci5odW5kcmVkLm1pZCcpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsIGBudW1iZXIuJHt0aW1lWzFdfS5taWRgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlVm94KGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRleHQgICA9IGVsZW1lbnQuaW5uZXJUZXh0LnRyaW0oKTtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gW107XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5zdGFydHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmVzdWx0LnB1c2goIGVsZW1lbnQuZGF0YXNldFsna2V5J10hICk7XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBzcGVlY2ggc3ludGhlc2lzIHVzaW5nIGJvdGggbmF0aXZlIGFuZCBjdXN0b20gZW5naW5lcyAqL1xyXG5jbGFzcyBTcGVlY2hcclxue1xyXG4gICAgLyoqIEluc3RhbmNlIG9mIHRoZSBjdXN0b20gdm9pY2UgZW5naW5lICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHZveEVuZ2luZT8gOiBWb3hFbmdpbmU7XHJcblxyXG4gICAgLyoqIERpY3Rpb25hcnkgb2YgYnJvd3Nlci1wcm92aWRlZCB2b2ljZXMgYXZhaWxhYmxlICovXHJcbiAgICBwdWJsaWMgIGJyb3dzZXJWb2ljZXMgOiBEaWN0aW9uYXJ5PFNwZWVjaFN5bnRoZXNpc1ZvaWNlPiA9IHt9O1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGlzIGF1ZGlibHkgc3Bva2VuICovXHJcbiAgICBwdWJsaWMgIG9uc3BlYWs/ICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBlbmRlZCAqL1xyXG4gICAgcHVibGljICBvbnN0b3A/ICAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG5hdGl2ZSBzcGVlY2gtc3RvcHBlZCBjaGVjayB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSBzdG9wVGltZXIgICAgIDogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvKiogV2hldGhlciBhbnkgc3BlZWNoIGVuZ2luZSBpcyBjdXJyZW50bHkgc3BlYWtpbmcgKi9cclxuICAgIHB1YmxpYyBnZXQgaXNTcGVha2luZygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLnZveEVuZ2luZSAmJiB0aGlzLnZveEVuZ2luZS5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFraW5nO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBWT1ggZW5naW5lIGlzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBnZXQgdm94QXZhaWxhYmxlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudm94RW5naW5lICE9PSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBTb21lIGJyb3dzZXJzIGRvbid0IHByb3Blcmx5IGNhbmNlbCBzcGVlY2ggb24gcGFnZSBjbG9zZS5cclxuICAgICAgICAvLyBCVUc6IG9ucGFnZXNob3cgYW5kIG9ucGFnZWhpZGUgbm90IHdvcmtpbmcgb24gaU9TIDExXHJcbiAgICAgICAgd2luZG93Lm9uYmVmb3JldW5sb2FkID1cclxuICAgICAgICB3aW5kb3cub251bmxvYWQgICAgICAgPVxyXG4gICAgICAgIHdpbmRvdy5vbnBhZ2VzaG93ICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZWhpZGUgICAgID0gdGhpcy5zdG9wLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50Lm9udmlzaWJpbGl0eWNoYW5nZSAgICAgICAgICAgID0gdGhpcy5vblZpc2liaWxpdHlDaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLm9udm9pY2VzY2hhbmdlZCA9IHRoaXMub25Wb2ljZXNDaGFuZ2VkLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEV2ZW4gdGhvdWdoICdvbnZvaWNlc2NoYW5nZWQnIGlzIHVzZWQgbGF0ZXIgdG8gcG9wdWxhdGUgdGhlIGxpc3QsIENocm9tZSBkb2VzXHJcbiAgICAgICAgLy8gbm90IGFjdHVhbGx5IGZpcmUgdGhlIGV2ZW50IHVudGlsIHRoaXMgY2FsbC4uLlxyXG4gICAgICAgIHRoaXMub25Wb2ljZXNDaGFuZ2VkKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzb21lIHJlYXNvbiwgQ2hyb21lIG5lZWRzIHRoaXMgY2FsbGVkIG9uY2UgZm9yIG5hdGl2ZSBzcGVlY2ggdG8gd29ya1xyXG4gICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuY2FuY2VsKCk7XHJcblxyXG4gICAgICAgIHRyeSAgICAgICAgIHsgdGhpcy52b3hFbmdpbmUgPSBuZXcgVm94RW5naW5lKCk7IH1cclxuICAgICAgICBjYXRjaCAoZXJyKSB7IGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBjcmVhdGUgVk9YIGVuZ2luZTonLCBlcnIpOyB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBzcGVha2luZyB0aGUgZ2l2ZW4gcGhyYXNlIGNvbXBvbmVudHMgKi9cclxuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIC8vIFZPWCBlbmdpbmVcclxuICAgICAgICBpZiAgICAgICggdGhpcy52b3hFbmdpbmUgJiYgZWl0aGVyKHNldHRpbmdzLnVzZVZveCwgUkFHLmNvbmZpZy52b3hFbmFibGVkKSApXHJcbiAgICAgICAgICAgIHRoaXMuc3BlYWtWb3gocGhyYXNlLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIC8vIE5hdGl2ZSBicm93c2VyIHRleHQtdG8tc3BlZWNoXHJcbiAgICAgICAgZWxzZSBpZiAod2luZG93LnNwZWVjaFN5bnRoZXNpcylcclxuICAgICAgICAgICAgdGhpcy5zcGVha0Jyb3dzZXIocGhyYXNlLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIC8vIE5vIHNwZWVjaCBhdmFpbGFibGU7IGNhbGwgc3RvcCBldmVudCBoYW5kbGVyXHJcbiAgICAgICAgZWxzZSBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgIHRoaXMub25zdG9wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIGFuZCBjYW5jZWxzIGFsbCBxdWV1ZWQgc3BlZWNoICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzKVxyXG4gICAgICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmNhbmNlbCgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy52b3hFbmdpbmUpXHJcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lLnN0b3AoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQYXVzZSBhbmQgdW5wYXVzZSBzcGVlY2ggaWYgdGhlIHBhZ2UgaXMgaGlkZGVuIG9yIHVuaGlkZGVuICovXHJcbiAgICBwcml2YXRlIG9uVmlzaWJpbGl0eUNoYW5nZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IFRoaXMgbmVlZHMgdG8gcGF1c2UgVk9YIGVuZ2luZVxyXG4gICAgICAgIGxldCBoaWRpbmcgPSAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIGlmIChoaWRpbmcpIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucGF1c2UoKTtcclxuICAgICAgICBlbHNlICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnJlc3VtZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGFzeW5jIHZvaWNlIGxpc3QgbG9hZGluZyBvbiBzb21lIGJyb3dzZXJzLCBhbmQgc2V0cyBkZWZhdWx0ICovXHJcbiAgICBwcml2YXRlIG9uVm9pY2VzQ2hhbmdlZCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuYnJvd3NlclZvaWNlcyA9IHt9O1xyXG5cclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmdldFZvaWNlcygpLmZvckVhY2godiA9PiB0aGlzLmJyb3dzZXJWb2ljZXNbdi5uYW1lXSA9IHYpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIGdpdmVuIHBocmFzZSB0byB0ZXh0IGFuZCBzcGVha3MgaXQgdmlhIG5hdGl2ZSBicm93c2VyIHZvaWNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3BlYWtCcm93c2VyKHBocmFzZTogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZvaWNlTmFtZSA9IGVpdGhlcihzZXR0aW5ncy52b2ljZU5hbWUsIFJBRy5jb25maWcuc3BlZWNoVm9pY2UpO1xyXG4gICAgICAgIGxldCB2b2ljZSAgICAgPSB0aGlzLmJyb3dzZXJWb2ljZXNbdm9pY2VOYW1lXTtcclxuXHJcbiAgICAgICAgLy8gUmVzZXQgdG8gZmlyc3Qgdm9pY2UsIGlmIGNvbmZpZ3VyZWQgY2hvaWNlIGlzIG1pc3NpbmdcclxuICAgICAgICBpZiAoIXZvaWNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGZpcnN0ID0gT2JqZWN0LmtleXModGhpcy5icm93c2VyVm9pY2VzKVswXTtcclxuICAgICAgICAgICAgdm9pY2UgICAgID0gdGhpcy5icm93c2VyVm9pY2VzW2ZpcnN0XTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFRoZSBwaHJhc2UgdGV4dCBpcyBzcGxpdCBpbnRvIHNlbnRlbmNlcywgYXMgcXVldWVpbmcgbGFyZ2Ugc2VudGVuY2VzIHRoYXQgbGFzdFxyXG4gICAgICAgIC8vIG1hbnkgc2Vjb25kcyBjYW4gYnJlYWsgc29tZSBUVFMgZW5naW5lcyBhbmQgYnJvd3NlcnMuXHJcbiAgICAgICAgbGV0IHRleHQgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoL1xcLlxccy9pKTtcclxuXHJcbiAgICAgICAgcGFydHMuZm9yRWFjaCggKHNlZ21lbnQsIGlkeCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEFkZCBtaXNzaW5nIGZ1bGwgc3RvcCB0byBlYWNoIHNlbnRlbmNlIGV4Y2VwdCB0aGUgbGFzdCwgd2hpY2ggaGFzIGl0XHJcbiAgICAgICAgICAgIGlmIChpZHggPCBwYXJ0cy5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICAgICAgc2VnbWVudCArPSAnLic7XHJcblxyXG4gICAgICAgICAgICBsZXQgdXR0ZXJhbmNlID0gbmV3IFNwZWVjaFN5bnRoZXNpc1V0dGVyYW5jZShzZWdtZW50KTtcclxuXHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2ljZSAgPSB2b2ljZTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIFJBRy5jb25maWcuc3BlZWNoVm9sKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnBpdGNoICA9IGVpdGhlcihzZXR0aW5ncy5waXRjaCwgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2gpO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2UucmF0ZSAgID0gZWl0aGVyKHNldHRpbmdzLnJhdGUsICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlKTtcclxuXHJcbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuc3BlYWsodXR0ZXJhbmNlKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBpbW1lZGlhdGVseS4gSSBkb24ndCB0cnVzdCBzcGVlY2ggZXZlbnRzIHRvIGJlIHJlbGlhYmxlOyBzZWUgYmVsb3cuXHJcbiAgICAgICAgaWYgKHRoaXMub25zcGVhaylcclxuICAgICAgICAgICAgdGhpcy5vbnNwZWFrKCk7XHJcblxyXG4gICAgICAgIC8vIFRoaXMgY2hlY2tzIGZvciB3aGVuIHRoZSBuYXRpdmUgZW5naW5lIGhhcyBzdG9wcGVkIHNwZWFraW5nLCBhbmQgY2FsbHMgdGhlXHJcbiAgICAgICAgLy8gb25zdG9wIGV2ZW50IGhhbmRsZXIuIEkgY291bGQgdXNlIFNwZWVjaFN5bnRoZXNpcy5vbmVuZCBpbnN0ZWFkLCBidXQgaXQgd2FzXHJcbiAgICAgICAgLy8gZm91bmQgdG8gYmUgdW5yZWxpYWJsZSwgc28gSSBoYXZlIHRvIHBvbGwgdGhlIHNwZWFraW5nIHByb3BlcnR5IHRoaXMgd2F5LlxyXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5zdG9wVGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLnN0b3BUaW1lciA9IHNldEludGVydmFsKCgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAod2luZG93LnNwZWVjaFN5bnRoZXNpcy5zcGVha2luZylcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5zdG9wVGltZXIpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgICAgICB9LCAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3ludGhlc2l6ZXMgdm9pY2UgYnkgd2Fsa2luZyB0aHJvdWdoIHRoZSBnaXZlbiBwaHJhc2UgZWxlbWVudHMsIHJlc29sdmluZyBwYXJ0cyB0b1xyXG4gICAgICogc291bmQgZmlsZSBJRHMsIGFuZCBmZWVkaW5nIHRoZSBlbnRpcmUgYXJyYXkgdG8gdGhlIHZveCBlbmdpbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBocmFzZSBQaHJhc2UgZWxlbWVudHMgdG8gc3BlYWtcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwZWFrVm94KHBocmFzZTogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc29sdmVyID0gbmV3IFJlc29sdmVyKHBocmFzZSk7XHJcbiAgICAgICAgbGV0IHZveFBhdGggID0gUkFHLmNvbmZpZy52b3hQYXRoIHx8IFJBRy5jb25maWcudm94Q3VzdG9tUGF0aDtcclxuXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3BlYWsgPSAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMub25zcGVhaylcclxuICAgICAgICAgICAgICAgIHRoaXMub25zcGVhaygpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgPSAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3BlYWsgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgID0gdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBcHBseSBzZXR0aW5ncyBmcm9tIGNvbmZpZyBoZXJlLCB0byBrZWVwIFZPWCBlbmdpbmUgZGVjb3VwbGVkIGZyb20gUkFHXHJcbiAgICAgICAgc2V0dGluZ3Mudm94UGF0aCAgID0gZWl0aGVyKHNldHRpbmdzLnZveFBhdGgsICAgdm94UGF0aCk7XHJcbiAgICAgICAgc2V0dGluZ3Mudm94UmV2ZXJiID0gZWl0aGVyKHNldHRpbmdzLnZveFJldmVyYiwgUkFHLmNvbmZpZy52b3hSZXZlcmIpO1xyXG4gICAgICAgIHNldHRpbmdzLnZveENoaW1lICA9IGVpdGhlcihzZXR0aW5ncy52b3hDaGltZSwgIFJBRy5jb25maWcudm94Q2hpbWUpO1xyXG4gICAgICAgIHNldHRpbmdzLnZvbHVtZSAgICA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsICAgIFJBRy5jb25maWcuc3BlZWNoVm9sKTtcclxuICAgICAgICBzZXR0aW5ncy5yYXRlICAgICAgPSBlaXRoZXIoc2V0dGluZ3MucmF0ZSwgICAgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUpO1xyXG5cclxuICAgICAgICB0aGlzLnZveEVuZ2luZSEuc3BlYWsocmVzb2x2ZXIudG9Wb3goKSwgc2V0dGluZ3MpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFR5cGUgZGVmaW5pdGlvbiBmb3Igc3BlZWNoIGNvbmZpZyBvdmVycmlkZXMgcGFzc2VkIHRvIHRoZSBzcGVhayBtZXRob2QgKi9cclxuaW50ZXJmYWNlIFNwZWVjaFNldHRpbmdzXHJcbntcclxuICAgIC8qKiBXaGV0aGVyIHRvIGZvcmNlIHVzZSBvZiB0aGUgVk9YIGVuZ2luZSAqL1xyXG4gICAgdXNlVm94PyAgICA6IGJvb2xlYW47XHJcbiAgICAvKiogT3ZlcnJpZGUgYWJzb2x1dGUgb3IgcmVsYXRpdmUgVVJMIG9mIFZPWCB2b2ljZSB0byB1c2UgKi9cclxuICAgIHZveFBhdGg/ICAgOiBzdHJpbmc7XHJcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIHJldmVyYiB0byB1c2UgKi9cclxuICAgIHZveFJldmVyYj8gOiBzdHJpbmc7XHJcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIGNoaW1lIHRvIHVzZSAqL1xyXG4gICAgdm94Q2hpbWU/ICA6IHN0cmluZztcclxuICAgIC8qKiBPdmVycmlkZSBjaG9pY2Ugb2YgbmF0aXZlIHZvaWNlICovXHJcbiAgICB2b2ljZU5hbWU/IDogc3RyaW5nO1xyXG4gICAgLyoqIE92ZXJyaWRlIHZvbHVtZSBvZiB2b2ljZSAqL1xyXG4gICAgdm9sdW1lPyAgICA6IG51bWJlcjtcclxuICAgIC8qKiBPdmVycmlkZSBwaXRjaCBvZiB2b2ljZSAqL1xyXG4gICAgcGl0Y2g/ICAgICA6IG51bWJlcjtcclxuICAgIC8qKiBPdmVycmlkZSByYXRlIG9mIHZvaWNlICovXHJcbiAgICByYXRlPyAgICAgIDogbnVtYmVyO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxudHlwZSBWb3hLZXkgPSBzdHJpbmcgfCBudW1iZXI7XHJcblxyXG4vKiogU3ludGhlc2l6ZXMgc3BlZWNoIGJ5IGR5bmFtaWNhbGx5IGxvYWRpbmcgYW5kIHBpZWNpbmcgdG9nZXRoZXIgdm9pY2UgZmlsZXMgKi9cclxuY2xhc3MgVm94RW5naW5lXHJcbntcclxuICAgIC8qKiBMaXN0IG9mIGltcHVsc2UgcmVzcG9uc2VzIHRoYXQgY29tZSB3aXRoIFJBRyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBSRVZFUkJTIDogRGljdGlvbmFyeTxzdHJpbmc+ID0ge1xyXG4gICAgICAgICcnICAgICAgICAgICAgICAgICAgICAgOiAnTm9uZScsXHJcbiAgICAgICAgJ2lyLnN0YWxiYW5zLndhdicgICAgICA6ICdUaGUgTGFkeSBDaGFwZWwsIFN0IEFsYmFucyBDYXRoZWRyYWwnLFxyXG4gICAgICAgICdpci5taWRkbGVfdHVubmVsLndhdicgOiAnSW5ub2NlbnQgUmFpbHdheSBUdW5uZWwsIEVkaW5idXJnaCcsXHJcbiAgICAgICAgJ2lyLmdyYW5nZS1jZW50cmUud2F2JyA6ICdHcmFuZ2Ugc3RvbmUgY2lyY2xlLCBDb3VudHkgTGltZXJpY2snXHJcbiAgICB9O1xyXG5cclxuICAgIC8qKiBUaGUgY29yZSBhdWRpbyBjb250ZXh0IHRoYXQgaGFuZGxlcyBhdWRpbyBlZmZlY3RzIGFuZCBwbGF5YmFjayAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBhdWRpb0NvbnRleHQgOiBBdWRpb0NvbnRleHQ7XHJcbiAgICAvKiogQXVkaW8gbm9kZSB0aGF0IGFtcGxpZmllcyBvciBhdHRlbnVhdGVzIHZvaWNlICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGdhaW5Ob2RlICAgICA6IEdhaW5Ob2RlO1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhcHBsaWVzIHRoZSB0YW5ub3kgZmlsdGVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGZpbHRlck5vZGUgICA6IEJpcXVhZEZpbHRlck5vZGU7XHJcbiAgICAvKipcclxuICAgICAqIENhY2hlIG9mIGltcHVsc2UgcmVzcG9uc2VzIHJldmVyYiBub2RlcywgZm9yIHJldmVyYi4gVGhpcyB1c2VkIHRvIGJlIGEgZGljdGlvbmFyeVxyXG4gICAgICogb2YgQXVkaW9CdWZmZXJzLCBidXQgQ29udm9sdmVyTm9kZXMgY2Fubm90IGhhdmUgdGhlaXIgYnVmZmVycyBjaGFuZ2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGltcHVsc2VzIDogRGljdGlvbmFyeTxDb252b2x2ZXJOb2RlPiA9IHt9O1xyXG4gICAgLyoqIFJlbGF0aXZlIHBhdGggdG8gZmV0Y2ggaW1wdWxzZSByZXNwb25zZSBhbmQgY2hpbWUgZmlsZXMgZnJvbSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkYXRhUGF0aCA6IHN0cmluZztcclxuXHJcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaGFzIGF1ZGlibHkgYmVndW4gKi9cclxuICAgIHB1YmxpYyAgb25zcGVhaz8gICAgICAgICA6ICgpID0+IHZvaWQ7XHJcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaGFzIGVuZGVkICovXHJcbiAgICBwdWJsaWMgIG9uc3RvcD8gICAgICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhpcyBlbmdpbmUgaXMgY3VycmVudGx5IHJ1bm5pbmcgYW5kIHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgIGlzU3BlYWtpbmcgICAgICAgOiBib29sZWFuICAgICAgPSBmYWxzZTtcclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgZW5naW5lIGhhcyBiZWd1biBzcGVha2luZyBmb3IgYSBjdXJyZW50IHNwZWVjaCAqL1xyXG4gICAgcHJpdmF0ZSBiZWd1blNwZWFraW5nICAgIDogYm9vbGVhbiAgICAgID0gZmFsc2U7XHJcbiAgICAvKiogUmVmZXJlbmNlIG51bWJlciBmb3IgdGhlIGN1cnJlbnQgcHVtcCB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSBwdW1wVGltZXIgICAgICAgIDogbnVtYmVyICAgICAgID0gMDtcclxuICAgIC8qKiBUcmFja3MgdGhlIGF1ZGlvIGNvbnRleHQncyB3YWxsLWNsb2NrIHRpbWUgdG8gc2NoZWR1bGUgbmV4dCBjbGlwICovXHJcbiAgICBwcml2YXRlIG5leHRCZWdpbiAgICAgICAgOiBudW1iZXIgICAgICAgPSAwO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHBlbmRpbmcgcmVxdWVzdHMsIGFzIGEgRklGTyBxdWV1ZSAqL1xyXG4gICAgcHJpdmF0ZSBwZW5kaW5nUmVxcyAgICAgIDogVm94UmVxdWVzdFtdID0gW107XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBjdXJyZW50bHkgc2NoZWR1bGVkIGF1ZGlvIGJ1ZmZlcnMgKi9cclxuICAgIHByaXZhdGUgc2NoZWR1bGVkQnVmZmVycyA6IEF1ZGlvQnVmZmVyU291cmNlTm9kZVtdID0gW107XHJcbiAgICAvKiogTGlzdCBvZiB2b3ggSURzIGN1cnJlbnRseSBiZWluZyBydW4gdGhyb3VnaCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50SWRzPyAgICAgIDogVm94S2V5W107XHJcbiAgICAvKiogU3BlZWNoIHNldHRpbmdzIGN1cnJlbnRseSBiZWluZyB1c2VkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRTZXR0aW5ncz8gOiBTcGVlY2hTZXR0aW5ncztcclxuICAgIC8qKiBSZXZlcmIgbm9kZSBjdXJyZW50bHkgYmVpbmcgdXNlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50UmV2ZXJiPyAgIDogQ29udm9sdmVyTm9kZTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZGF0YVBhdGg6IHN0cmluZyA9ICdkYXRhL3ZveCcpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dXAgdGhlIGNvcmUgYXVkaW8gY29udGV4dFxyXG5cclxuICAgICAgICAvLyBAdHMtaWdub3JlIC0gRGVmaW5pbmcgdGhlc2UgaW4gV2luZG93IGludGVyZmFjZSBkb2VzIG5vdCB3b3JrXHJcbiAgICAgICAgbGV0IGF1ZGlvQ29udGV4dCAgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgYXVkaW9Db250ZXh0KCk7XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5hdWRpb0NvbnRleHQpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGdldCBhdWRpbyBjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIG5vZGVzXHJcblxyXG4gICAgICAgIHRoaXMuZGF0YVBhdGggICA9IGRhdGFQYXRoO1xyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcclxuICAgICAgICB0aGlzLmZpbHRlck5vZGUgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCaXF1YWRGaWx0ZXIoKTtcclxuXHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLnR5cGUgICAgICA9ICdoaWdocGFzcyc7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLlEudmFsdWUgICA9IDAuNDtcclxuXHJcbiAgICAgICAgdGhpcy5nYWluTm9kZS5jb25uZWN0KHRoaXMuZmlsdGVyTm9kZSk7XHJcbiAgICAgICAgLy8gUmVzdCBvZiBub2RlcyBnZXQgY29ubmVjdGVkIHdoZW4gc3BlYWsgaXMgY2FsbGVkXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCZWdpbnMgbG9hZGluZyBhbmQgc3BlYWtpbmcgYSBzZXQgb2Ygdm94IGZpbGVzLiBTdG9wcyBhbnkgc3BlZWNoLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZHMgTGlzdCBvZiB2b3ggaWRzIHRvIGxvYWQgYXMgZmlsZXMsIGluIHNwZWFraW5nIG9yZGVyXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgVm9pY2Ugc2V0dGluZ3MgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzcGVhayhpZHM6IFZveEtleVtdLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTUEVBSzonLCBpZHMsIHNldHRpbmdzKTtcclxuXHJcbiAgICAgICAgLy8gU2V0IHN0YXRlXHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgICAgICA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5iZWd1blNwZWFraW5nICAgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRJZHMgICAgICA9IGlkcztcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzO1xyXG5cclxuICAgICAgICAvLyBTZXQgcmV2ZXJiXHJcblxyXG4gICAgICAgIGlmICggU3RyaW5ncy5pc051bGxPckVtcHR5KHNldHRpbmdzLnZveFJldmVyYikgKVxyXG4gICAgICAgICAgICB0aGlzLnNldFJldmVyYigpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBmaWxlICAgPSBzZXR0aW5ncy52b3hSZXZlcmIhO1xyXG4gICAgICAgICAgICBsZXQgcmV2ZXJiID0gdGhpcy5pbXB1bHNlc1tmaWxlXTtcclxuXHJcbiAgICAgICAgICAgIGlmICghcmV2ZXJiKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAvLyBNYWtlIHN1cmUgcmV2ZXJiIGlzIG9mZiBmaXJzdCwgZWxzZSBjbGlwcyB3aWxsIHF1ZXVlIGluIHRoZSBhdWRpb1xyXG4gICAgICAgICAgICAgICAgLy8gYnVmZmVyIGFuZCBhbGwgc3VkZGVubHkgcGxheSBhdCB0aGUgc2FtZSB0aW1lLCB3aGVuIHJldmVyYiBsb2Fkcy5cclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0UmV2ZXJiKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgZmV0Y2goYCR7dGhpcy5kYXRhUGF0aH0vJHtmaWxlfWApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIHJlcyA9PiByZXMuYXJyYXlCdWZmZXIoKSApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIGJ1ZiA9PiBTb3VuZHMuZGVjb2RlKHRoaXMuYXVkaW9Db250ZXh0LCBidWYpIClcclxuICAgICAgICAgICAgICAgICAgICAudGhlbiggaW1wID0+IHRoaXMuY3JlYXRlUmV2ZXJiKGZpbGUsIGltcCkgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFJldmVyYihyZXZlcmIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHZvbHVtZVxyXG5cclxuICAgICAgICBsZXQgdm9sdW1lID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgMSk7XHJcblxyXG4gICAgICAgIC8vIFJlbWFwcyB0aGUgMS4xLi4uMS45IHJhbmdlIHRvIDIuLi4xMFxyXG4gICAgICAgIGlmICh2b2x1bWUgPiAxKVxyXG4gICAgICAgICAgICB2b2x1bWUgPSAodm9sdW1lICogMTApIC0gOTtcclxuXHJcbiAgICAgICAgdGhpcy5nYWluTm9kZS5nYWluLnZhbHVlID0gdm9sdW1lO1xyXG5cclxuICAgICAgICAvLyBTZXQgY2hpbWUsIGF0IGZvcmNlZCBwbGF5YmFjayByYXRlIG9mIDFcclxuXHJcbiAgICAgICAgaWYgKCAhU3RyaW5ncy5pc051bGxPckVtcHR5KHNldHRpbmdzLnZveENoaW1lKSApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGF0aCAgICAgID0gYCR7dGhpcy5kYXRhUGF0aH0vJHtzZXR0aW5ncy52b3hDaGltZSF9YDtcclxuICAgICAgICAgICAgbGV0IHJlcSAgICAgICA9IG5ldyBWb3hSZXF1ZXN0KHBhdGgsIDAsIHRoaXMuYXVkaW9Db250ZXh0KTtcclxuICAgICAgICAgICAgcmVxLmZvcmNlUmF0ZSA9IDE7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2gocmVxKTtcclxuICAgICAgICAgICAgaWRzLnVuc2hpZnQoMS4wKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEJlZ2luIHRoZSBwdW1wIGxvb3AuIE9uIGlPUywgdGhlIGNvbnRleHQgbWF5IGhhdmUgdG8gYmUgcmVzdW1lZCBmaXJzdFxyXG5cclxuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnKVxyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKS50aGVuKCAoKSA9PiB0aGlzLnB1bXAoKSApO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5wdW1wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHBsYXlpbmcgYW55IGN1cnJlbnRseSBzcG9rZW4gc3BlZWNoIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gQWxyZWFkeSBzdG9wcGVkPyBEbyBub3QgY29udGludWVcclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmdcclxuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wdW1wVGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gQ2FuY2VsIGFsbCBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5mb3JFYWNoKCByID0+IHIuY2FuY2VsKCkgKTtcclxuXHJcbiAgICAgICAgLy8gS2lsbCBhbmQgZGVyZWZlcmVuY2UgYW55IGN1cnJlbnRseSBwbGF5aW5nIGZpbGVcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuZm9yRWFjaChub2RlID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBub2RlLnN0b3AoKTtcclxuICAgICAgICAgICAgbm9kZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICAgICAgICA9IDA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLnBlbmRpbmdSZXFzICAgICAgPSBbXTtcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMgPSBbXTtcclxuXHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFNUT1BQRUQnKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHVtcHMgdGhlIHNwZWVjaCBxdWV1ZSwgYnkga2VlcGluZyB1cCB0byAxMCBmZXRjaCByZXF1ZXN0cyBmb3Igdm9pY2UgZmlsZXMgZ29pbmcsXHJcbiAgICAgKiBhbmQgdGhlbiBmZWVkaW5nIHRoZWlyIGRhdGEgKGluIGVuZm9yY2VkIG9yZGVyKSB0byB0aGUgYXVkaW8gY2hhaW4sIG9uZSBhdCBhIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcHVtcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIHRoZSBlbmdpbmUgaGFzIHN0b3BwZWQsIGRvIG5vdCBwcm9jZWVkLlxyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nIHx8ICF0aGlzLmN1cnJlbnRJZHMgfHwgIXRoaXMuY3VycmVudFNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzY2hlZHVsZSBmdWxmaWxsZWQgcmVxdWVzdHMgaW50byB0aGUgYXVkaW8gYnVmZmVyLCBpbiBGSUZPIG9yZGVyXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZSgpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBmaWxsIGFueSBmcmVlIHBlbmRpbmcgc2xvdHMgd2l0aCBuZXcgcmVxdWVzdHNcclxuICAgICAgICBsZXQgbmV4dERlbGF5ID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuY3VycmVudElkc1swXSAmJiB0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8IDEwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IHRoaXMuY3VycmVudElkcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMga2V5IGlzIGEgbnVtYmVyLCBpdCdzIGFuIGFtb3VudCBvZiBzaWxlbmNlLCBzbyBhZGQgaXQgYXMgdGhlXHJcbiAgICAgICAgICAgIC8vIHBsYXliYWNrIGRlbGF5IGZvciB0aGUgbmV4dCBwbGF5YWJsZSByZXF1ZXN0IChpZiBhbnkpLlxyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ251bWJlcicpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5leHREZWxheSArPSBrZXk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbGV0IHBhdGggPSBgJHt0aGlzLmN1cnJlbnRTZXR0aW5ncy52b3hQYXRofS8ke2tleX0ubXAzYDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ1JlcXMucHVzaCggbmV3IFZveFJlcXVlc3QocGF0aCwgbmV4dERlbGF5LCB0aGlzLmF1ZGlvQ29udGV4dCkgKTtcclxuICAgICAgICAgICAgbmV4dERlbGF5ID0gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0b3AgcHVtcGluZyB3aGVuIHdlJ3JlIG91dCBvZiBJRHMgdG8gcXVldWUgYW5kIG5vdGhpbmcgaXMgcGxheWluZ1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZHMubGVuZ3RoICAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ1JlcXMubGVuZ3RoICAgICAgPD0gMClcclxuICAgICAgICBpZiAodGhpcy5zY2hlZHVsZWRCdWZmZXJzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIHRoaXMucHVtcFRpbWVyID0gc2V0VGltZW91dCh0aGlzLnB1bXAuYmluZCh0aGlzKSwgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RvcCBzY2hlZHVsaW5nIGlmIHRoZXJlIGFyZSBubyBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgaWYgKCF0aGlzLnBlbmRpbmdSZXFzWzBdIHx8ICF0aGlzLnBlbmRpbmdSZXFzWzBdLmlzRG9uZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCBzY2hlZHVsZSBpZiBtb3JlIHRoYW4gNSBub2RlcyBhcmUsIGFzIG5vdCB0byBibG93IGFueSBidWZmZXJzXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPiA1KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCByZXEgPSB0aGlzLnBlbmRpbmdSZXFzLnNoaWZ0KCkhO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgbmV4dCByZXF1ZXN0IGVycm9yZWQgb3V0IChidWZmZXIgbWlzc2luZyksIHNraXAgaXRcclxuICAgICAgICBpZiAoIXJlcS5idWZmZXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgU0tJUFBFRDonLCByZXEucGF0aCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNjaGVkdWxlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGlzIGlzIHRoZSBmaXJzdCBjbGlwIGJlaW5nIHBsYXllZCwgc3RhcnQgZnJvbSBjdXJyZW50IHdhbGwtY2xvY2tcclxuICAgICAgICBpZiAodGhpcy5uZXh0QmVnaW4gPT09IDApXHJcbiAgICAgICAgICAgIHRoaXMubmV4dEJlZ2luID0gdGhpcy5hdWRpb0NvbnRleHQuY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBRVUVVRUQ6JywgcmVxLnBhdGgsIHJlcS5idWZmZXIuZHVyYXRpb24sIHRoaXMubmV4dEJlZ2luKTtcclxuXHJcbiAgICAgICAgLy8gQmFzZSBsYXRlbmN5IG5vdCBhdmFpbGFibGUgaW4gc29tZSBicm93c2Vyc1xyXG4gICAgICAgIGxldCBsYXRlbmN5ID0gKHRoaXMuYXVkaW9Db250ZXh0LmJhc2VMYXRlbmN5IHx8IDAuMDEpICsgMC4xNTtcclxuICAgICAgICBsZXQgbm9kZSAgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgIGxldCByYXRlICAgID0gcmVxLmZvcmNlUmF0ZSB8fCB0aGlzLmN1cnJlbnRTZXR0aW5ncyEucmF0ZSB8fCAxO1xyXG4gICAgICAgIG5vZGUuYnVmZmVyID0gcmVxLmJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8gUmVtYXAgcmF0ZSBmcm9tIDAuMS4uMS45IHRvIDAuOC4uMS41XHJcbiAgICAgICAgaWYgICAgICAocmF0ZSA8IDEpIHJhdGUgPSAocmF0ZSAqIDAuMikgKyAwLjg7XHJcbiAgICAgICAgZWxzZSBpZiAocmF0ZSA+IDEpIHJhdGUgPSAocmF0ZSAqIDAuNSkgKyAwLjU7XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSBkZWxheSBhbmQgZHVyYXRpb24gYmFzZWQgb24gcGxheWJhY2sgcmF0ZVxyXG4gICAgICAgIGxldCBkZWxheSAgICA9IHJlcS5kZWxheSAqICgxIC8gcmF0ZSk7XHJcbiAgICAgICAgbGV0IGR1cmF0aW9uID0gbm9kZS5idWZmZXIuZHVyYXRpb24gKiAoMSAvIHJhdGUpO1xyXG5cclxuICAgICAgICBub2RlLnBsYXliYWNrUmF0ZS52YWx1ZSA9IHJhdGU7XHJcbiAgICAgICAgbm9kZS5jb25uZWN0KHRoaXMuZ2Fpbk5vZGUpO1xyXG4gICAgICAgIG5vZGUuc3RhcnQodGhpcy5uZXh0QmVnaW4gKyBkZWxheSk7XHJcblxyXG4gICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5wdXNoKG5vZGUpO1xyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICs9IChkdXJhdGlvbiArIGRlbGF5IC0gbGF0ZW5jeSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUgb24tZmlyc3Qtc3BlYWsgZXZlbnRcclxuICAgICAgICBpZiAoIXRoaXMuYmVndW5TcGVha2luZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYmVndW5TcGVha2luZyA9IHRydWU7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnNwZWFrKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnNwZWFrKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYXZlIHRoaXMgYnVmZmVyIG5vZGUgcmVtb3ZlIGl0c2VsZiBmcm9tIHRoZSBzY2hlZHVsZSB3aGVuIGRvbmVcclxuICAgICAgICBub2RlLm9uZW5kZWQgPSBfID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgRU5ERUQ6JywgcmVxLnBhdGgpO1xyXG4gICAgICAgICAgICBsZXQgaWR4ID0gdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmluZGV4T2Yobm9kZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSlcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5zcGxpY2UoaWR4LCAxKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlUmV2ZXJiKGZpbGU6IHN0cmluZywgaW1wdWxzZTogQXVkaW9CdWZmZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuaW1wdWxzZXNbZmlsZV0gICAgICAgICAgID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQ29udm9sdmVyKCk7XHJcbiAgICAgICAgdGhpcy5pbXB1bHNlc1tmaWxlXS5idWZmZXIgICAgPSBpbXB1bHNlO1xyXG4gICAgICAgIHRoaXMuaW1wdWxzZXNbZmlsZV0ubm9ybWFsaXplID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnNldFJldmVyYih0aGlzLmltcHVsc2VzW2ZpbGVdKTtcclxuICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggUkVWRVJCIExPQURFRDonLCBmaWxlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldFJldmVyYihyZXZlcmI/OiBDb252b2x2ZXJOb2RlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UmV2ZXJiKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UmV2ZXJiLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UmV2ZXJiID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLmRpc2Nvbm5lY3QoKTtcclxuXHJcbiAgICAgICAgaWYgKHJldmVyYilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFJldmVyYiA9IHJldmVyYjtcclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJOb2RlLmNvbm5lY3QocmV2ZXJiKTtcclxuICAgICAgICAgICAgcmV2ZXJiLmNvbm5lY3QodGhpcy5hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgcmVxdWVzdCBmb3IgYSB2b3ggZmlsZSwgaW1tZWRpYXRlbHkgYmVndW4gb24gY3JlYXRpb24gKi9cclxuY2xhc3MgVm94UmVxdWVzdFxyXG57XHJcbiAgICAvKiogUmVsYXRpdmUgcmVtb3RlIHBhdGggb2YgdGhpcyB2b2ljZSBmaWxlIHJlcXVlc3QgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgcGF0aCAgICA6IHN0cmluZztcclxuICAgIC8qKiBBbW91bnQgb2Ygc2Vjb25kcyB0byBkZWxheSB0aGUgcGxheWJhY2sgb2YgdGhpcyByZXF1ZXN0ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGRlbGF5ICAgOiBudW1iZXI7XHJcbiAgICAvKiogQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQgOiBBdWRpb0NvbnRleHQ7XHJcbiAgICAvKiogQWJvcnQgY29udHJvbGxlciB0byBhbGxvdyB0aGUgZmV0Y2ggdG8gYmUgYWJvcnRlZCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBhYm9ydCAgIDogQWJvcnRDb250cm9sbGVyO1xyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBkb25lIGFuZCByZWFkeSBmb3IgaGFuZGxpbmcgKGV2ZW4gaWYgZmFpbGVkKSAqL1xyXG4gICAgcHVibGljIGlzRG9uZSAgICAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogUmF3IGF1ZGlvIGRhdGEgZnJvbSB0aGUgbG9hZGVkIGZpbGUsIGlmIGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljIGJ1ZmZlcj8gICAgOiBBdWRpb0J1ZmZlcjtcclxuICAgIC8qKiBQbGF5YmFjayByYXRlIHRvIGZvcmNlIHRoaXMgY2xpcCB0byBwbGF5IGF0ICovXHJcbiAgICBwdWJsaWMgZm9yY2VSYXRlPyA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGF0aDogc3RyaW5nLCBkZWxheTogbnVtYmVyLCBjb250ZXh0OiBBdWRpb0NvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFUVVFU1Q6JywgcGF0aCk7XHJcbiAgICAgICAgdGhpcy5jb250ZXh0ID0gY29udGV4dDtcclxuICAgICAgICB0aGlzLnBhdGggICAgPSBwYXRoO1xyXG4gICAgICAgIHRoaXMuZGVsYXkgICA9IGRlbGF5O1xyXG4gICAgICAgIHRoaXMuYWJvcnQgICA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcclxuXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vd2ViL3VwZGF0ZXMvMjAxNy8wOS9hYm9ydGFibGUtZmV0Y2hcclxuICAgICAgICBmZXRjaChwYXRoLCB7IHNpZ25hbCA6IHRoaXMuYWJvcnQuc2lnbmFsIH0pXHJcbiAgICAgICAgICAgIC50aGVuICggdGhpcy5vbkZ1bGZpbGwuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICApO1xyXG5cclxuICAgICAgICAvLyBUaW1lb3V0IGFsbCBmZXRjaGVzIGJ5IDEwIHNlY29uZHNcclxuICAgICAgICBzZXRUaW1lb3V0KF8gPT4gdGhpcy5hYm9ydC5hYm9ydCgpLCAxMCAqIDEwMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYW5jZWxzIHRoaXMgcmVxdWVzdCBmcm9tIHByb2NlZWRpbmcgYW55IGZ1cnRoZXIgKi9cclxuICAgIHB1YmxpYyBjYW5jZWwoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmFib3J0LmFib3J0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBkZWNvZGluZyB0aGUgbG9hZGVkIE1QMyB2b2ljZSBmaWxlIHRvIHJhdyBhdWRpbyBkYXRhICovXHJcbiAgICBwcml2YXRlIG9uRnVsZmlsbChyZXM6IFJlc3BvbnNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXJlcy5vaylcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoYFZPWCBOT1QgRk9VTkQ6ICR7cmVzLnN0YXR1c30gQCAke3RoaXMucGF0aH1gKTtcclxuXHJcbiAgICAgICAgcmVzLmFycmF5QnVmZmVyKCkudGhlbiggdGhpcy5vbkFycmF5QnVmZmVyLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVGFrZXMgdGhlIGFycmF5IGJ1ZmZlciBmcm9tIHRoZSBmdWxmaWxsZWQgZmV0Y2ggYW5kIGRlY29kZXMgaXQgKi9cclxuICAgIHByaXZhdGUgb25BcnJheUJ1ZmZlcihidWZmZXI6IEFycmF5QnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTb3VuZHMuZGVjb2RlKHRoaXMuY29udGV4dCwgYnVmZmVyKVxyXG4gICAgICAgICAgICAudGhlbiAoIHRoaXMub25EZWNvZGUuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIHRoZSBmZXRjaGVkIGJ1ZmZlciBpcyBkZWNvZGVkIHN1Y2Nlc3NmdWxseSAqL1xyXG4gICAgcHJpdmF0ZSBvbkRlY29kZShidWZmZXI6IEF1ZGlvQnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlcjtcclxuICAgICAgICB0aGlzLmlzRG9uZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGxlZCBpZiB0aGUgZmV0Y2ggb3IgZGVjb2RlIHN0YWdlcyBmYWlsICovXHJcbiAgICBwcml2YXRlIG9uRXJyb3IoZXJyOiBhbnkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdSRVFVRVNUIEZBSUw6JywgZXJyKTtcclxuICAgICAgICB0aGlzLmlzRG9uZSA9IHRydWU7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLyBUT0RPOiBNYWtlIGFsbCB2aWV3cyB1c2UgdGhpcyBjbGFzc1xyXG4vKiogQmFzZSBjbGFzcyBmb3IgYSB2aWV3OyBhbnl0aGluZyB3aXRoIGEgYmFzZSBET00gZWxlbWVudCAqL1xyXG5hYnN0cmFjdCBjbGFzcyBWaWV3QmFzZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgdmlldydzIHByaW1hcnkgRE9NIGVsZW1lbnQgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyB0aGlzIGJhc2UgdmlldywgYXR0YWNoaW5nIGl0IHRvIHRoZSBlbGVtZW50IG1hdGNoaW5nIHRoZSBnaXZlbiBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKGRvbVF1ZXJ5OiBzdHJpbmcgfCBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBpZiAodHlwZW9mIGRvbVF1ZXJ5ID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgdGhpcy5kb20gPSBET00ucmVxdWlyZShkb21RdWVyeSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmRvbSA9IGRvbVF1ZXJ5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoaXMgdmlldydzIGNoaWxkIGVsZW1lbnQgbWF0Y2hpbmcgdGhlIGdpdmVuIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgYXR0YWNoPFQgZXh0ZW5kcyBIVE1MRWxlbWVudD4ocXVlcnk6IHN0cmluZykgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5yZXF1aXJlKHF1ZXJ5LCB0aGlzLmRvbSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy88cmVmZXJlbmNlIHBhdGg9XCJ2aWV3QmFzZS50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgZGlzY2xhaW1lciBzY3JlZW4gKi9cclxuY2xhc3MgRGlzY2xhaW1lciBleHRlbmRzIFZpZXdCYXNlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIFwiY29udGludWVcIiBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuRGlzbWlzcyA6IEhUTUxCdXR0b25FbGVtZW50ID0gdGhpcy5hdHRhY2goJyNidG5EaXNtaXNzJyk7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbGFzdCBmb2N1c2VkIGVsZW1lbnQsIGlmIGFueSAqL1xyXG4gICAgcHJpdmF0ZSBsYXN0QWN0aXZlPyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJyNkaXNjbGFpbWVyU2NyZWVuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE9wZW5zIHRoZSBkaXNjbGFpbWVyIGZvciBmaXJzdCB0aW1lIHVzZXJzICovXHJcbiAgICBwdWJsaWMgZGlzY2xhaW0oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoUkFHLmNvbmZpZy5yZWFkRGlzY2xhaW1lcilcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmxhc3RBY3RpdmUgICAgICAgICA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuICAgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiAgICAgICAgID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5idG5EaXNtaXNzLm9uY2xpY2sgPSB0aGlzLm9uRGlzbWlzcy5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuRGlzbWlzcy5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQZXJzaXN0cyB0aGUgZGlzbWlzc2FsIHRvIHN0b3JhZ2UgYW5kIHJlc3RvcmVzIHRoZSB2aWV3IHVuZGVybmVhdGggKi9cclxuICAgIHByaXZhdGUgb25EaXNtaXNzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5yZWFkRGlzY2xhaW1lciA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuICAgICAgICAgICA9IHRydWU7XHJcbiAgICAgICAgLy8gRGFzaGJvYXJkIHJvbGU6IHRoZSBlZGl0b3IgdmlldyBzdGF5cyBoaWRkZW4g4oCUIHRoZSBwYW5lbCBpcyB3aGF0XHJcbiAgICAgICAgLy8gc2hvd3MuIFNjcmVlbiByb2xlOiByZXN0b3JlIHRoZSBtYXJxdWVlIGVkaXRvci5cclxuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gICAgID0gUkFHLmlzRGFzaGJvYXJkUm9sZSgpO1xyXG4gICAgICAgIHRoaXMuYnRuRGlzbWlzcy5vbmNsaWNrICAgPSBudWxsO1xyXG4gICAgICAgIFJBRy5jb25maWcuc2F2ZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5sYXN0QWN0aXZlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5sYXN0QWN0aXZlLmZvY3VzKCk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEFjdGl2ZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZSBlZGl0b3IgKi9cclxuY2xhc3MgRWRpdG9yXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSBjb250YWluZXIgZm9yIHRoZSBlZGl0b3IgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIGRpYWxvZywgaWYgYW55ICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRQaWNrZXI/IDogUGlja2VyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgY3VycmVudGx5IGJlaW5nIGVkaXRlZCwgaWYgYW55ICovXHJcbiAgICAvLyBEbyBub3QgRFJZOyBuZWVkcyB0byBiZSBwYXNzZWQgdG8gdGhlIHBpY2tlciBmb3IgY2xlYW5lciBjb2RlXHJcbiAgICBwcml2YXRlIGRvbUVkaXRpbmc/ICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKCcjZWRpdG9yJyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25jbGljayA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHdpbmRvdy5vbnJlc2l6ZSAgICAgICA9IHRoaXMub25SZXNpemUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS5vbnNjcm9sbCAgICAgPSB0aGlzLm9uU2Nyb2xsLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20udGV4dENvbnRlbnQgID0gTC5FRElUT1JfSU5JVDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVwbGFjZXMgdGhlIGVkaXRvciB3aXRoIGEgcm9vdCBwaHJhc2VzZXQgcmVmZXJlbmNlLCBhbmQgZXhwYW5kcyBpdCBpbnRvIEhUTUwgKi9cclxuICAgIHB1YmxpYyBnZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmlubmVySFRNTCA9ICc8cGhyYXNlc2V0IHJlZj1cInJvb3RcIiAvPic7XHJcblxyXG4gICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3ModGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuYXR0YWNoQ29udHJvbHMoKTtcclxuXHJcbiAgICAgICAgLy8gRm9yIHNjcm9sbC1wYXN0IHBhZGRpbmcgdW5kZXIgdGhlIHBocmFzZVxyXG4gICAgICAgIGxldCBwYWRkaW5nICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG4gICAgICAgIHBhZGRpbmcuY2xhc3NOYW1lID0gJ2JvdHRvbVBhZGRpbmcnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5hcHBlbmRDaGlsZChwYWRkaW5nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVwcm9jZXNzZXMgYWxsIHBocmFzZXNldCBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gcmVmLCBpZiB0aGVpciBpbmRleCBoYXMgY2hhbmdlZCAqL1xyXG4gICAgcHVibGljIHJlZnJlc2hQaHJhc2VzZXQocmVmOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIE5vdGUsIHRoaXMgY291bGQgcG90ZW50aWFsbHkgYnVnIG91dCBpZiBhIHBocmFzZXNldCdzIGRlc2NlbmRhbnQgcmVmZXJlbmNlc1xyXG4gICAgICAgIC8vIHRoZSBzYW1lIHBocmFzZXNldCAocmVjdXJzaW9uKS4gQnV0IHRoaXMgaXMgb2theSBiZWNhdXNlIHBocmFzZXNldHMgc2hvdWxkXHJcbiAgICAgICAgLy8gbmV2ZXIgaW5jbHVkZSB0aGVtc2VsdmVzLCBldmVuIGV2ZW50dWFsbHkuXHJcblxyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW5bZGF0YS10eXBlPXBocmFzZXNldF1bZGF0YS1yZWY9JHtyZWZ9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKF8gPT5cclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQgICAgPSBfIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgbGV0IG5ld0VsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwaHJhc2VzZXQnKTtcclxuICAgICAgICAgICAgICAgIGxldCBjaGFuY2UgICAgID0gZWxlbWVudC5kYXRhc2V0WydjaGFuY2UnXTtcclxuXHJcbiAgICAgICAgICAgICAgICBuZXdFbGVtZW50LnNldEF0dHJpYnV0ZSgncmVmJywgcmVmKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoY2hhbmNlKVxyXG4gICAgICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuc2V0QXR0cmlidXRlKCdjaGFuY2UnLCBjaGFuY2UpO1xyXG5cclxuICAgICAgICAgICAgICAgIGVsZW1lbnQucGFyZW50RWxlbWVudCEucmVwbGFjZUNoaWxkKG5ld0VsZW1lbnQsIGVsZW1lbnQpO1xyXG4gICAgICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2VzcyhuZXdFbGVtZW50LnBhcmVudEVsZW1lbnQhKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXR0YWNoQ29udHJvbHMoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgc3RhdGljIE5vZGVMaXN0IG9mIGFsbCBwaHJhc2UgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHF1ZXJ5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBxdWVyeSBRdWVyeSBzdHJpbmcgdG8gYWRkIG9udG8gdGhlIGBzcGFuYCBzZWxlY3RvclxyXG4gICAgICogQHJldHVybnMgTm9kZSBsaXN0IG9mIGFsbCBlbGVtZW50cyBtYXRjaGluZyB0aGUgZ2l2ZW4gc3BhbiBxdWVyeVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcpIDogTm9kZUxpc3RcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChgc3BhbiR7cXVlcnl9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGN1cnJlbnQgcGhyYXNlJ3Mgcm9vdCBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZSgpIDogSFRNTEVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGN1cnJlbnQgcGhyYXNlIGluIHRoZSBlZGl0b3IgYXMgdGV4dCwgZXhjbHVkaW5nIHRoZSBoaWRkZW4gcGFydHMgKi9cclxuICAgIHB1YmxpYyBnZXRUZXh0KCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dCh0aGlzLmRvbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyBhbGwgcGhyYXNlIGVsZW1lbnRzIG9mIHRoZSBnaXZlbiB0eXBlLCBhbmQgc2V0cyB0aGVpciB0ZXh0IHRvIGdpdmVuIHZhbHVlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0eXBlIE9yaWdpbmFsIFhNTCBuYW1lIG9mIGVsZW1lbnRzIHRvIHJlcGxhY2UgY29udGVudHMgb2ZcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBOZXcgdGV4dCBmb3IgdGhlIGZvdW5kIGVsZW1lbnRzIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0RWxlbWVudHNUZXh0KHR5cGU6IHN0cmluZywgdmFsdWU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9JHt0eXBlfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyBhbnkgY3VycmVudGx5IG9wZW4gZWRpdG9yIGRpYWxvZ3MgKi9cclxuICAgIHB1YmxpYyBjbG9zZURpYWxvZygpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5jbG9zZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5kb21FZGl0aW5nKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLnJlbW92ZUF0dHJpYnV0ZSgnZWRpdGluZycpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYWJvdmUnLCAnYmVsb3cnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlciA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGF0dGFjaGVzIFVJIGNvbnRyb2xzIGZvciBjZXJ0YWluIHBocmFzZSBlbGVtZW50cyAqL1xyXG4gICAgcHJpdmF0ZSBhdHRhY2hDb250cm9scygpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXR5cGU9cGhyYXNlc2V0XScpLmZvckVhY2goc3BhbiA9PlxyXG4gICAgICAgICAgICBQaHJhc2VzZXRCdXR0b24uY3JlYXRlQW5kQXR0YWNoKHNwYW4pXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtY2hhbmNlXScpLmZvckVhY2goc3BhbiA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUuY3JlYXRlQW5kQXR0YWNoKHNwYW4pO1xyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS51cGRhdGUoc3BhbiBhcyBIVE1MRWxlbWVudCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgYSBjbGljayBhbnl3aGVyZSBpbiB0aGUgd2luZG93IGRlcGVuZGluZyBvbiB0aGUgY29udGV4dCAqL1xyXG4gICAgcHJpdmF0ZSBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFyZ2V0ID0gZXYudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgPSB0YXJnZXQgPyB0YXJnZXQuZGF0YXNldFsndHlwZSddICAgIDogdW5kZWZpbmVkO1xyXG4gICAgICAgIGxldCBwaWNrZXIgPSB0eXBlICAgPyBSQUcudmlld3MuZ2V0UGlja2VyKHR5cGUpIDogdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICBpZiAoIXRhcmdldClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2xvc2VEaWFsb2coKTtcclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGNsaWNrcyBvZiBpbm5lciBlbGVtZW50c1xyXG4gICAgICAgIGlmICggdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnaW5uZXInKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGNsaWNrcyB0byBhbnkgaW5uZXIgZG9jdW1lbnQgb3IgdW5vd25lZCBlbGVtZW50XHJcbiAgICAgICAgaWYgKCAhZG9jdW1lbnQuYm9keS5jb250YWlucyh0YXJnZXQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBlbGVtZW50IG9mIGFscmVhZHkgb3BlbiBwaWNrZXJzXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIgKVxyXG4gICAgICAgIGlmICggdGhpcy5jdXJyZW50UGlja2VyLmRvbS5jb250YWlucyh0YXJnZXQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBDYW5jZWwgYW55IG9wZW4gZWRpdG9yc1xyXG4gICAgICAgIGxldCBwcmV2VGFyZ2V0ID0gdGhpcy5kb21FZGl0aW5nO1xyXG4gICAgICAgIHRoaXMuY2xvc2VEaWFsb2coKTtcclxuXHJcbiAgICAgICAgLy8gRG9uJ3QgaGFuZGxlIHBocmFzZSBvciBwaHJhc2VzZXRzIC0gb25seSB2aWEgdGhlaXIgYnV0dG9uc1xyXG4gICAgICAgIGlmICh0eXBlID09PSAncGhyYXNlJyB8fCB0eXBlID09PSAncGhyYXNlc2V0JylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJZiBjbGlja2luZyB0aGUgZWxlbWVudCBhbHJlYWR5IGJlaW5nIGVkaXRlZCwgZG9uJ3QgcmVvcGVuXHJcbiAgICAgICAgaWYgKHRhcmdldCA9PT0gcHJldlRhcmdldClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgdG9nZ2xlICAgICAgID0gdGFyZ2V0LmNsb3Nlc3QoJy50b2dnbGUnKSAgICAgICBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgY2hvb3NlUGhyYXNlID0gdGFyZ2V0LmNsb3Nlc3QoJy5jaG9vc2VQaHJhc2UnKSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGNvbGxhcHNpYmxlIGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKHRvZ2dsZSlcclxuICAgICAgICAgICAgdGhpcy50b2dnbGVDb2xsYXBzaWFibGUodG9nZ2xlKTtcclxuXHJcbiAgICAgICAgLy8gU3BlY2lhbCBjYXNlIGZvciBwaHJhc2VzZXQgY2hvb3NlclxyXG4gICAgICAgIGVsc2UgaWYgKGNob29zZVBocmFzZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFRPRE86IEFzc2VydCBoZXJlP1xyXG4gICAgICAgICAgICB0YXJnZXQgPSBjaG9vc2VQaHJhc2UucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHBpY2tlciA9IFJBRy52aWV3cy5nZXRQaWNrZXIodGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXSEpO1xyXG4gICAgICAgICAgICB0aGlzLm9wZW5QaWNrZXIodGFyZ2V0LCBwaWNrZXIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRmluZCBhbmQgb3BlbiBwaWNrZXIgZm9yIHRoZSB0YXJnZXQgZWxlbWVudFxyXG4gICAgICAgIGVsc2UgaWYgKHR5cGUgJiYgcGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLm9wZW5QaWNrZXIodGFyZ2V0LCBwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiByZXNpemUgKi9cclxuICAgIHByaXZhdGUgb25SZXNpemUoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmUtbGF5b3V0IHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgb24gc2Nyb2xsICovXHJcbiAgICBwcml2YXRlIG9uU2Nyb2xsKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBXb3JrYXJvdW5kIGZvciBsYXlvdXQgYmVoYXZpbmcgd2VpcmQgd2hlbiBpT1Mga2V5Ym9hcmQgaXMgb3BlblxyXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlci5oYXNGb2N1cygpKVxyXG4gICAgICAgICAgICBET00uYmx1ckFjdGl2ZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGbGlwcyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSwgYW5kIHByb3BhZ2F0ZXMgdGhlIG5ldyBzdGF0ZSB0byBvdGhlclxyXG4gICAgICogY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZmVyZW5jZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IENvbGxhcHNpYmxlIGVsZW1lbnQgYmVpbmcgdG9nZ2xlZFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHRvZ2dsZUNvbGxhcHNpYWJsZSh0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IHRhcmdldC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcmVmICAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgdHlwZSAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICd0eXBlJyk7XHJcbiAgICAgICAgbGV0IGNvbGxhcGFzZWQgPSBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgLy8gUHJvcGFnYXRlIG5ldyBjb2xsYXBzZSBzdGF0ZSB0byBhbGwgY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZlxyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoXHJcbiAgICAgICAgICAgIGBzcGFuW2RhdGEtdHlwZT0ke3R5cGV9XVtkYXRhLXJlZj0ke3JlZn1dW2RhdGEtY2hhbmNlXWBcclxuICAgICAgICApLmZvckVhY2goc3BhbiA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KHNwYW4gYXMgSFRNTEVsZW1lbnQsICFjb2xsYXBhc2VkKTtcclxuICAgICAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLnVwZGF0ZShzcGFuIGFzIEhUTUxFbGVtZW50KTtcclxuICAgICAgICAgICAgICAgIC8vIERvbid0IG1vdmUgdGhpcyB0byBDb2xsYXBzaWJsZXMuc2V0LCBhcyBzdGF0ZSBzYXZlL2xvYWQgaXMgaGFuZGxlZFxyXG4gICAgICAgICAgICAgICAgLy8gb3V0c2lkZSBpbiBib3RoIHVzYWdlcyBvZiBzZXRDb2xsYXBzaWJsZS5cclxuICAgICAgICAgICAgICAgIFJBRy5zdGF0ZS5zZXRDb2xsYXBzZWQocmVmLCAhY29sbGFwYXNlZCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3BlbnMgYSBwaWNrZXIgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWRpdG9yIGVsZW1lbnQgdG8gb3BlbiB0aGUgcGlja2VyIGZvclxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9wZW5QaWNrZXIodGFyZ2V0OiBIVE1MRWxlbWVudCwgcGlja2VyOiBQaWNrZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRhcmdldC5zZXRBdHRyaWJ1dGUoJ2VkaXRpbmcnLCAndHJ1ZScpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSBwaWNrZXI7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdGFyZ2V0O1xyXG4gICAgICAgIHBpY2tlci5vcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNjcm9sbGluZyBtYXJxdWVlICovXHJcbmNsYXNzIE1hcnF1ZWVcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFycXVlZSdzIERPTSBlbGVtZW50ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbSAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNwYW4gZWxlbWVudCBpbiB0aGUgbWFycXVlZSwgd2hlcmUgdGhlIHRleHQgaXMgc2V0ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVNwYW4gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIElEIGZvciB0aGUgc2Nyb2xsaW5nIGFuaW1hdGlvbiB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSB0aW1lciAgOiBudW1iZXIgPSAwO1xyXG4gICAgLyoqIEN1cnJlbnQgb2Zmc2V0IChpbiBwaXhlbHMpIG9mIHRoZSBzY3JvbGxpbmcgbWFycXVlZSAqL1xyXG4gICAgcHJpdmF0ZSBvZmZzZXQgOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgID0gRE9NLnJlcXVpcmUoJyNtYXJxdWVlJyk7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICB0aGlzLmRvbS5hcHBlbmRDaGlsZCh0aGlzLmRvbVNwYW4pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBtZXNzYWdlIG9uIHRoZSBzY3JvbGxpbmcgbWFycXVlZSwgYW5kIHN0YXJ0cyBhbmltYXRpbmcgaXQgKi9cclxuICAgIHB1YmxpYyBzZXQobXNnOiBzdHJpbmcsIGFuaW1hdGU6IGJvb2xlYW4gPSB0cnVlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy50aW1lcik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi50ZXh0Q29udGVudCAgICAgPSBtc2c7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoIWFuaW1hdGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSSB0cmllZCB0byB1c2UgQ1NTIGFuaW1hdGlvbiBmb3IgdGhpcywgYnV0IGNvdWxkbid0IGZpZ3VyZSBvdXQgaG93IGZvciBhXHJcbiAgICAgICAgLy8gZHluYW1pY2FsbHkgc2l6ZWQgZWxlbWVudCBsaWtlIHRoZSBzcGFuLlxyXG4gICAgICAgIHRoaXMub2Zmc2V0ID0gdGhpcy5kb20uY2xpZW50V2lkdGg7XHJcbiAgICAgICAgbGV0IGxpbWl0ICAgPSAtdGhpcy5kb21TcGFuLmNsaWVudFdpZHRoIC0gMTAwO1xyXG4gICAgICAgIGxldCBhbmltICAgID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMub2Zmc2V0ICAgICAgICAgICAgICAgICAgLT0gNjtcclxuICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSAgPSBgdHJhbnNsYXRlWCgke3RoaXMub2Zmc2V0fXB4KWA7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vZmZzZXQgPCBsaW1pdClcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhpcy50aW1lciA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN3YXAgaW4gbmV3IHRleHQgd2l0aG91dCByZXN0YXJ0aW5nIHRoZSBzY3JvbGwuIFdoaWxlIHRoZSBtYXJxdWVlIGlzXHJcbiAgICAgKiBhbHJlYWR5IHNjcm9sbGluZywgdGhlIG5ldyB0ZXh0IHRha2VzIG92ZXIgaW4gcGxhY2UgKHVzZWQgZm9yIHdhaXRcclxuICAgICAqIGNvdW50ZG93biB0aWNrcywgc28gdGhleSBkb24ndCBqdW1wIGJhY2sgdG8gdGhlIHJpZ2h0IGVkZ2UgZXZlcnlcclxuICAgICAqIHNlY29uZCk7IG90aGVyd2lzZSBpdCBiZWhhdmVzIGxpa2UgYSBmcmVzaCBzZXQoKS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFNvZnQobXNnOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLnRpbWVyICE9PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5kb21TcGFuLnRleHRDb250ZW50ID0gbXNnO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnNldChtc2cpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyB0aGUgY3VycmVudCBtYXJxdWVlIGFuaW1hdGlvbiAqL1xyXG4gICAgcHVibGljIHN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy50aW1lcik7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwidmlld0Jhc2UudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG5jbGFzcyBTZXR0aW5ncyBleHRlbmRzIFZpZXdCYXNlXHJcbntcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUmVzZXQgICAgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5SZXNldFNldHRpbmdzJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blNhdmUgICAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuU2F2ZVNldHRpbmdzJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNoa1VzZVZveCAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjY2hrVXNlVm94Jyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGhpbnRVc2VWb3ggICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MRWxlbWVudD4gICAgICAgKCcjaGludFVzZVZveCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hWb2ljZSAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveFZvaWNlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0Vm94UGF0aCAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjaW5wdXRWb3hQYXRoJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFZveFJldmVyYiAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94UmV2ZXJiJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFZveENoaW1lICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94Q2hpbWUnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsU3BlZWNoVm9pY2UgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxTcGVlY2hDaG9pY2UnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hWb2wgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFZvbCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSByYW5nZVNwZWVjaFBpdGNoID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI3JhbmdlU3BlZWNoUGl0Y2gnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hSYXRlICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFJhdGUnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuU3BlZWNoVGVzdCAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5TcGVlY2hUZXN0Jyk7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdGltZXIgZm9yIHRoZSBcIlJlc2V0XCIgYnV0dG9uIGNvbmZpcm1hdGlvbiBzdGVwICovXHJcbiAgICBwcml2YXRlIHJlc2V0VGltZW91dD8gOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignI3NldHRpbmdzU2NyZWVuJyk7XHJcbiAgICAgICAgLy8gVE9ETzogQ2hlY2sgaWYgVk9YIGlzIGF2YWlsYWJsZSwgZGlzYWJsZSBpZiBub3RcclxuXHJcbiAgICAgICAgdGhpcy5idG5SZXNldC5vbmNsaWNrICAgICAgPSB0aGlzLmhhbmRsZVJlc2V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgICAgICAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmNoa1VzZVZveC5vbmNoYW5nZSAgICA9IHRoaXMubGF5b3V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hWb2ljZS5vbmNoYW5nZSAgPSB0aGlzLmxheW91dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5vbmNsaWNrID0gdGhpcy5oYW5kbGVWb2ljZVRlc3QuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGUgbGlzdCBvZiBpbXB1bHNlIHJlc3BvbnNlIGZpbGVzXHJcbiAgICAgICAgRE9NLnBvcHVsYXRlKHRoaXMuc2VsVm94UmV2ZXJiLCBWb3hFbmdpbmUuUkVWRVJCUywgUkFHLmNvbmZpZy52b3hSZXZlcmIpO1xyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZSB0aGUgbGVnYWwgJiBhY2tub3dsZWRnZW1lbnRzIGJsb2NrXHJcbiAgICAgICAgTGlua2Rvd24ubG9hZEludG8oJ0FCT1VULm1kJywgJyNhYm91dEJsb2NrJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE9wZW5zIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBvcGVuKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVGhlIHZvaWNlIGxpc3QgaGFzIHRvIGJlIHBvcHVsYXRlZCBlYWNoIG9wZW4sIGluIGNhc2UgaXQgY2hhbmdlc1xyXG4gICAgICAgIHRoaXMucG9wdWxhdGVWb2ljZUxpc3QoKTtcclxuXHJcbiAgICAgICAgaWYgKCFSQUcuc3BlZWNoLnZveEF2YWlsYWJsZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFRPRE8gOiBMb2NhbGl6ZVxyXG4gICAgICAgICAgICB0aGlzLmNoa1VzZVZveC5jaGVja2VkICAgID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuY2hrVXNlVm94LmRpc2FibGVkICAgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmhpbnRVc2VWb3guaW5uZXJIVE1MID0gJzxzdHJvbmc+Vk9YIGVuZ2luZTwvc3Ryb25nPiBpcyB1bmF2YWlsYWJsZS4nICtcclxuICAgICAgICAgICAgICAgICcgWW91ciBicm93c2VyIG9yIGRldmljZSBtYXkgbm90IGJlIHN1cHBvcnRlZDsgcGxlYXNlIGNoZWNrIHRoZSBjb25zb2xlJyArXHJcbiAgICAgICAgICAgICAgICAnIGZvciBtb3JlIGluZm9ybWF0aW9uLic7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5jaGtVc2VWb3guY2hlY2tlZCA9IFJBRy5jb25maWcudm94RW5hYmxlZDtcclxuXHJcbiAgICAgICAgdGhpcy5zZWxWb3hWb2ljZS52YWx1ZSAgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveFBhdGg7XHJcbiAgICAgICAgdGhpcy5pbnB1dFZveFBhdGgudmFsdWUgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveEN1c3RvbVBhdGg7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hSZXZlcmIudmFsdWUgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveFJldmVyYjtcclxuICAgICAgICB0aGlzLnNlbFZveENoaW1lLnZhbHVlICAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94Q2hpbWU7XHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS52YWx1ZSAgICAgICAgICAgPSBSQUcuY29uZmlnLnNwZWVjaFZvaWNlO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWVBc051bWJlciAgID0gUkFHLmNvbmZpZy5zcGVlY2hWb2w7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIgPSBSQUcuY29uZmlnLnNwZWVjaFBpdGNoO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXIgID0gUkFHLmNvbmZpZy5zcGVlY2hSYXRlO1xyXG5cclxuICAgICAgICB0aGlzLmxheW91dCgpO1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IHRydWU7XHJcbiAgICAgICAgLy8gUmV0dXJuIGZvY3VzIHRvIHRoZSBwYW5lbCBidXR0b24gdGhhdCBvcGVuZWQgdXMsIGlmIHdlIHdlcmVcclxuICAgICAgICAvLyBvcGVuZWQgZnJvbSB0aGUgZGFzaGJvYXJkIHBhbmVsOyB0aGUgZWRpdG9yIHZpZXcgaGFzIG5vIG9wZW5lci5cclxuICAgICAgICBsZXQgb3BlbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Rhc2hTZXR0aW5ncycpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcclxuICAgICAgICBpZiAob3BlbmVyKVxyXG4gICAgICAgICAgICBvcGVuZXIuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FsY3VsYXRlcyBmb3JtIGxheW91dCBhbmQgY29udHJvbCB2aXNpYmlsaXR5IGJhc2VkIG9uIHN0YXRlICovXHJcbiAgICBwcml2YXRlIGxheW91dCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB2b3hFbmFibGVkID0gdGhpcy5jaGtVc2VWb3guY2hlY2tlZDtcclxuICAgICAgICBsZXQgdm94Q3VzdG9tICA9ICh0aGlzLnNlbFZveFZvaWNlLnZhbHVlID09PSAnJyk7XHJcblxyXG4gICAgICAgIERPTS50b2dnbGVIaWRkZW5BbGwoXHJcbiAgICAgICAgICAgIFt0aGlzLnNlbFNwZWVjaFZvaWNlLCAgICF2b3hFbmFibGVkXSxcclxuICAgICAgICAgICAgW3RoaXMucmFuZ2VTcGVlY2hQaXRjaCwgIXZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxWb3hWb2ljZSwgICAgICAgdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLmlucHV0Vm94UGF0aCwgICAgICB2b3hFbmFibGVkICYmIHZveEN1c3RvbV0sXHJcbiAgICAgICAgICAgIFt0aGlzLnNlbFZveFJldmVyYiwgICAgICB2b3hFbmFibGVkXSxcclxuICAgICAgICAgICAgW3RoaXMuc2VsVm94Q2hpbWUsICAgICAgIHZveEVuYWJsZWRdXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYXJzIGFuZCBwb3B1bGF0ZXMgdGhlIHZvaWNlIGxpc3QgKi9cclxuICAgIHByaXZhdGUgcG9wdWxhdGVWb2ljZUxpc3QoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnNlbFNwZWVjaFZvaWNlLmlubmVySFRNTCA9ICcnO1xyXG5cclxuICAgICAgICBsZXQgdm9pY2VzID0gUkFHLnNwZWVjaC5icm93c2VyVm9pY2VzO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW1wdHkgbGlzdFxyXG4gICAgICAgIGlmICh2b2ljZXMgPT09IHt9KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IG9wdGlvbiAgICAgID0gRE9NLmFkZE9wdGlvbih0aGlzLnNlbFNwZWVjaFZvaWNlLCBMLlNUX1NQRUVDSF9FTVBUWSk7XHJcbiAgICAgICAgICAgIG9wdGlvbi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9TcGVlY2hTeW50aGVzaXNcclxuICAgICAgICBlbHNlIGZvciAobGV0IG5hbWUgaW4gdm9pY2VzKVxyXG4gICAgICAgICAgICBET00uYWRkT3B0aW9uKHRoaXMuc2VsU3BlZWNoVm9pY2UsIGAke25hbWV9ICgke3ZvaWNlc1tuYW1lXS5sYW5nfSlgLCBuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcmVzZXQgYnV0dG9uLCB3aXRoIGEgY29uZmlybSBzdGVwIHRoYXQgY2FuY2VscyBhZnRlciAxNSBzZWNvbmRzICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnJlc2V0VGltZW91dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gc2V0VGltZW91dCh0aGlzLmNhbmNlbFJlc2V0LmJpbmQodGhpcyksIDE1MDAwKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUX0NPTkZJUk07XHJcbiAgICAgICAgICAgIHRoaXMuYnRuUmVzZXQudGl0bGUgICAgID0gTC5TVF9SRVNFVF9DT05GSVJNX1Q7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcucmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICB0aGlzLmNhbmNlbFJlc2V0KCk7XHJcbiAgICAgICAgdGhpcy5vcGVuKCk7XHJcbiAgICAgICAgYWxlcnQoTC5TVF9SRVNFVF9ET05FKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FuY2VsIHRoZSByZXNldCB0aW1lb3V0IGFuZCByZXN0b3JlIHRoZSByZXNldCBidXR0b24gdG8gbm9ybWFsICovXHJcbiAgICBwcml2YXRlIGNhbmNlbFJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlc2V0VGltZW91dCk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUO1xyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQudGl0bGUgICAgID0gTC5TVF9SRVNFVF9UO1xyXG4gICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzYXZlIGJ1dHRvbiwgc2F2aW5nIGNvbmZpZyB0byBzdG9yYWdlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuY29uZmlnLnZveEVuYWJsZWQgICAgPSB0aGlzLmNoa1VzZVZveC5jaGVja2VkO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94UGF0aCAgICAgICA9IHRoaXMuc2VsVm94Vm9pY2UudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoID0gdGhpcy5pbnB1dFZveFBhdGgudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hSZXZlcmIgICAgID0gdGhpcy5zZWxWb3hSZXZlcmIudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hDaGltZSAgICAgID0gdGhpcy5zZWxWb3hDaGltZS52YWx1ZTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFZvaWNlICAgPSB0aGlzLnNlbFNwZWVjaFZvaWNlLnZhbHVlO1xyXG4gICAgICAgIC8vIHBhcnNlRmxvYXQgaW5zdGVhZCBvZiB2YWx1ZUFzTnVtYmVyOyBzZWUgQXJjaGl0ZWN0dXJlLm1kXHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2wgICAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFBpdGNoICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlICAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zYXZlKCk7XHJcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzcGVlY2ggdGVzdCBidXR0b24sIHNwZWFraW5nIGEgdGVzdCBwaHJhc2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlVm9pY2VUZXN0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QuZGlzYWJsZWQgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBIYXMgdG8gZXhlY3V0ZSBvbiBhIGRlbGF5LCBhcyBzcGVlY2ggY2FuY2VsIGlzIHVucmVsaWFibGUgd2l0aG91dCBpdFxyXG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QuZGlzYWJsZWQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIGxldCBwaHJhc2UgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICAgICAgcGhyYXNlLmlubmVySFRNTCA9ICc8cGhyYXNlIHJlZj1cInNhbXBsZVwiLz4nO1xyXG5cclxuICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2VzcyhwaHJhc2UpO1xyXG5cclxuICAgICAgICAgICAgUkFHLnNwZWVjaC5zcGVhayhcclxuICAgICAgICAgICAgICAgIHBocmFzZS5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgdXNlVm94ICAgIDogdGhpcy5jaGtVc2VWb3guY2hlY2tlZCxcclxuICAgICAgICAgICAgICAgICAgICB2b3hQYXRoICAgOiB0aGlzLnNlbFZveFZvaWNlLnZhbHVlIHx8IHRoaXMuaW5wdXRWb3hQYXRoLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHZveFJldmVyYiA6IHRoaXMuc2VsVm94UmV2ZXJiLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHZveENoaW1lICA6IHRoaXMuc2VsVm94Q2hpbWUudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm9pY2VOYW1lIDogdGhpcy5zZWxTcGVlY2hWb2ljZS52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICB2b2x1bWUgICAgOiB0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlQXNOdW1iZXIsXHJcbiAgICAgICAgICAgICAgICAgICAgcGl0Y2ggICAgIDogdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIsXHJcbiAgICAgICAgICAgICAgICAgICAgcmF0ZSAgICAgIDogdGhpcy5yYW5nZVNwZWVjaFJhdGUudmFsdWVBc051bWJlclxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0sIDIwMCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXG5cbi8qKlxuICogQ29udHJvbGxlciBmb3IgdGhlIHRvcCB0b29sYmFyIG9mIHRoZSBzdGVwIGVkaXRvciB2aWV3OiBQbGF5LCBTdG9wLFxuICogU2h1ZmZsZSAocmVnZW5lcmF0ZSksIFVwZGF0ZSBTdGVwLCBhbmQgQ2xvc2UuXG4gKlxuICogQm90aCBwYWdlcyAoaW5kZXguaHRtbCBhbmQgc2NyZWVuLmh0bWwpIGNhcnJ5IHRoZSBpZGVudGljYWwgdG9vbGJhci5cbiAqIFRoZSBkYXNoYm9hcmQgcm9sZSByZXZlYWxzIGl0IG9ubHkgd2hpbGUgZWRpdGluZyBhIHN0ZXA7IHRoZSBzY3JlZW5cbiAqIHJvbGUgaGlkZXMgaXQgYXQgYm9vdCwgc28gaXRzIGJ1dHRvbnMgYXJlIG5ldmVyIHVzZWQgdGhlcmUuXG4gKi9cbmNsYXNzIFRvb2xiYXJcbntcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbSAgICAgICAgIDogSFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5QbGF5ICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuU3RvcCAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkdlbmVyYXRlIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5VcGRhdGVTdGVwIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5DbG9zZSAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xuXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcbiAgICB7XG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgICA9IERPTS5yZXF1aXJlKCcjdG9vbGJhcicpO1xuICAgICAgICB0aGlzLmJ0blBsYXkgICAgICAgPSBET00ucmVxdWlyZSgnI2J0blBsYXknKTtcbiAgICAgICAgdGhpcy5idG5TdG9wICAgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TdG9wJyk7XG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUgICA9IERPTS5yZXF1aXJlKCcjYnRuU2h1ZmZsZScpO1xuICAgICAgICB0aGlzLmJ0blVwZGF0ZVN0ZXAgPSBET00ucmVxdWlyZSgnI2J0blVwZGF0ZVN0ZXAnKTtcbiAgICAgICAgdGhpcy5idG5DbG9zZSAgICAgICA9IERPTS5yZXF1aXJlKCcjYnRuQ2xvc2UnKTtcblxuICAgICAgICB0aGlzLmJ0blBsYXkub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVBsYXkuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5idG5TdG9wLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTdG9wLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUub25jbGljayA9IHRoaXMuaGFuZGxlR2VuZXJhdGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5idG5VcGRhdGVTdGVwLm9uY2xpY2sgPSB0aGlzLmhhbmRsZVVwZGF0ZVN0ZXAuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5idG5DbG9zZS5vbmNsaWNrICAgID0gdGhpcy5oYW5kbGVDbG9zZS5iaW5kKHRoaXMpO1xuXG4gICAgICAgIGlmICghUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LmFkZCgndGhyb2InKTtcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuZm9jdXMoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKiogUGxheXMgdGhlIGN1cnJlbnQgYW5ub3VuY2VtZW50IHRocm91Z2ggdGhlIHNwZWVjaCBlbmdpbmUgKi9cbiAgICBwcml2YXRlIGhhbmRsZVBsYXkoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xuICAgICAgICB0aGlzLmJ0blBsYXkuZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICB3aW5kb3cuc2V0VGltZW91dCh0aGlzLmhhbmRsZVBsYXkyLmJpbmQodGhpcyksIDIwMCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5MigpIDogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IGhhc1Nwb2tlbiAgID0gZmFsc2U7XG4gICAgICAgIGxldCBzcGVlY2hUZXh0ICA9IFJBRy52aWV3cy5lZGl0b3IuZ2V0VGV4dCgpO1xuICAgICAgICB0aGlzLmJ0blBsYXkuaGlkZGVuID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5idG5QbGF5LmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuYnRuU3RvcC5oaWRkZW4gPSBmYWxzZTtcblxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0xvYWRpbmcgVk9YLi4uJywgZmFsc2UpO1xuXG4gICAgICAgIGxldCB0aW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XG4gICAgICAgIH0sIDEwICogMTAwMCk7XG5cbiAgICAgICAgUkFHLnNwZWVjaC5vbnNwZWFrID0gKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KHNwZWVjaFRleHQpO1xuICAgICAgICAgICAgaGFzU3Bva2VuICAgICAgICAgID0gdHJ1ZTtcbiAgICAgICAgICAgIFJBRy5zcGVlY2gub25zcGVhayA9IHVuZGVmaW5lZDtcbiAgICAgICAgfTtcblxuICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCA9ICgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlU3RvcCgpO1xuICAgICAgICAgICAgaWYgKCFoYXNTcG9rZW4gJiYgUkFHLmNvbmZpZy52b3hFbmFibGVkKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFJBRy5jb25maWcudm94RW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGFsZXJ0KCdJdCBhcHBlYXJzIHRoYXQgdGhlIFZPWCBlbmdpbmUgd2FzIHVuYWJsZSB0byBzYXkgYW55dGhpbmcuIFRoZSBWT1ggZW5naW5lIGhhcyBiZWVuIGRpc2FibGVkIGFuZCBuYXRpdmUgdGV4dC10by1zcGVlY2ggd2lsbCBiZSB1c2VkIG9uIG5leHQgcGxheS4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKCFoYXNTcG9rZW4pXG4gICAgICAgICAgICAgICAgYWxlcnQoJ0l0IGFwcGVhcnMgdGhhdCB0aGUgYnJvd3NlciB3YXMgdW5hYmxlIHRvIHNheSBhbnl0aGluZy4gUGxlYXNlIGNoZWNrIHRoZSBjb25zb2xlLicpO1xuICAgICAgICAgICAgaWYgKCFoYXNTcG9rZW4pXG4gICAgICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KHNwZWVjaFRleHQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIFJBRy5zcGVlY2guc3BlYWsoUkFHLnZpZXdzLmVkaXRvci5nZXRQaHJhc2UoKSk7XG4gICAgICAgIHRoaXMuYnRuU3RvcC5mb2N1cygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlU3RvcChldj86IEV2ZW50KSA6IHZvaWRcbiAgICB7XG4gICAgICAgIFJBRy5zcGVlY2gub25zcGVhayAgPSB1bmRlZmluZWQ7XG4gICAgICAgIFJBRy5zcGVlY2gub25zdG9wICAgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuYnRuUGxheS5oaWRkZW4gPSBmYWxzZTtcbiAgICAgICAgaWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMuYnRuU3RvcClcbiAgICAgICAgICAgIHRoaXMuYnRuUGxheS5mb2N1cygpO1xuICAgICAgICB0aGlzLmJ0blN0b3AuaGlkZGVuID0gdHJ1ZTtcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XG4gICAgICAgIGlmIChldilcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKSwgZmFsc2UpO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlR2VuZXJhdGUoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LnJlbW92ZSgndGhyb2InKTtcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XG4gICAgICAgIFJBRy5jb25maWcuY2xpY2tlZEdlbmVyYXRlID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXcml0ZXMgdGhlIGN1cnJlbnQgYW5ub3VuY2VtZW50IGJhY2sgaW50byB0aGUgc2VsZWN0ZWQgc2NlbmFyaW8gc3RlcFxuICAgICAqICh0aGUgb25lIG9wZW5lZCBmb3IgZWRpdGluZyBmcm9tIHRoZSBkYXNoYm9hcmQpLCB0aGVuIGNsb3NlcyB0aGVcbiAgICAgKiBlZGl0b3IgdmlldyB0byByZXR1cm4gdG8gdGhlIHNjZW5hcmlvIGRhc2hib2FyZC5cbiAgICAgKi9cbiAgICBwcml2YXRlIGhhbmRsZVVwZGF0ZVN0ZXAoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBpZCA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdyYWcuY3VycmVudFNjZW5hcmlvSWQnKTtcbiAgICAgICAgbGV0IGlkeFN0ciA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdyYWcuc2VsZWN0ZWRTdGVwSW5kZXgnKTtcbiAgICAgICAgaWYgKCFpZCB8fCBpZHhTdHIgPT09IG51bGwpIHsgYWxlcnQoJ05vIHNjZW5hcmlvL3N0ZXAgc2VsZWN0ZWQuIE9wZW4gdGhlIGRhc2hib2FyZCBhbmQgY2xpY2sgYSBzdGVwIGZpcnN0LicpOyByZXR1cm47IH1cblxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoaWR4U3RyKTtcbiAgICAgICAgbGV0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdyYWcuc2NlbmFyaW9zJyk7XG4gICAgICAgIGlmICghcmF3KSB7IGFsZXJ0KCdObyBzY2VuYXJpb3Mgc2F2ZWQgeWV0LicpOyByZXR1cm47IH1cblxuICAgICAgICBsZXQgc2NlbmFyaW9zID0gSlNPTi5wYXJzZShyYXcpIGFzIGFueVtdO1xuICAgICAgICBsZXQgc2MgPSBzY2VuYXJpb3MuZmluZCgoczogYW55KSA9PiBzLmlkID09PSBpZCk7XG4gICAgICAgIGlmICghc2MgfHwgIXNjLnN0ZXBzW2lkeF0pIHsgYWxlcnQoJ1N0ZXAgbm90IGZvdW5kLicpOyByZXR1cm47IH1cblxuICAgICAgICBzYy5zdGVwc1tpZHhdLnN0YXRlSnNvbiA9IEpTT04uc3RyaW5naWZ5KFJBRy5zdGF0ZSk7XG4gICAgICAgIHNjLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcuc2NlbmFyaW9zJywgSlNPTi5zdHJpbmdpZnkoc2NlbmFyaW9zKSk7XG4gICAgICAgIFJBRy5kYXNoYm9hcmQuY2xvc2VFZGl0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2xvc2UgcmVxdWVzdCBmcm9tIHRoZSDinJUgYnV0dG9uOiB0aGUgZGFzaGJvYXJkIGNsb3NlcyBzdHJhaWdodCBhd2F5XG4gICAgICogaWYgdGhlIHN0ZXAgaGFzIG5vIHVuc2F2ZWQgY2hhbmdlcywgYW5kIGFza3MgZmlyc3Qgb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIHByaXZhdGUgaGFuZGxlQ2xvc2UoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIFJBRy5kYXNoYm9hcmQucmVxdWVzdENsb3NlKCk7XG4gICAgfVxufVxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgVUkgZWxlbWVudHMgYW5kIHRoZWlyIGxvZ2ljICovXHJcbmNsYXNzIFZpZXdzXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG1haW4gICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gZGlzY2xhaW1lciBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZGlzY2xhaW1lciA6IERpc2NsYWltZXI7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIGVkaXRvciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZWRpdG9yICAgICA6IEVkaXRvcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gbWFycXVlZSBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbWFycXVlZSAgICA6IE1hcnF1ZWU7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXR0aW5ncyAgIDogU2V0dGluZ3M7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHRvb2xiYXIgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHRvb2xiYXIgICAgOiBUb29sYmFyO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gYWxsIHRoZSBwaWNrZXJzLCBvbmUgZm9yIGVhY2ggdHlwZSBvZiBYTUwgZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBwaWNrZXJzICAgIDogRGljdGlvbmFyeTxQaWNrZXI+O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5tYWluICAgICAgID0gRE9NLnJlcXVpcmUoJyNtYWluU2NyZWVuJyk7XHJcbiAgICAgICAgdGhpcy5kaXNjbGFpbWVyID0gbmV3IERpc2NsYWltZXIoKTtcclxuICAgICAgICB0aGlzLmVkaXRvciAgICAgPSBuZXcgRWRpdG9yKCk7XHJcbiAgICAgICAgdGhpcy5tYXJxdWVlICAgID0gbmV3IE1hcnF1ZWUoKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzICAgPSBuZXcgU2V0dGluZ3MoKTtcclxuICAgICAgICB0aGlzLnRvb2xiYXIgICAgPSBuZXcgVG9vbGJhcigpO1xyXG4gICAgICAgIHRoaXMucGlja2VycyAgICA9IHt9O1xyXG5cclxuICAgICAgICBbXHJcbiAgICAgICAgICAgIG5ldyBDb2FjaFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgRXhjdXNlUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBJbnRlZ2VyUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBOYW1lZFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgUGhyYXNlc2V0UGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBQbGF0Zm9ybVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgU2VydmljZVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgU3RhdGlvblBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgU3RhdGlvbkxpc3RQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFRpbWVQaWNrZXIoKVxyXG4gICAgICAgIF0uZm9yRWFjaChwaWNrZXIgPT4gdGhpcy5waWNrZXJzW3BpY2tlci54bWxUYWddID0gcGlja2VyKTtcclxuXHJcbiAgICAgICAgLy8gR2xvYmFsIGhvdGtleXNcclxuICAgICAgICBkb2N1bWVudC5ib2R5Lm9ua2V5ZG93biA9IHRoaXMub25JbnB1dC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBBcHBseSBpT1Mtc3BlY2lmaWMgQ1NTIGZpeGVzXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdpb3MnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgcGlja2VyIHRoYXQgaGFuZGxlcyBhIGdpdmVuIHRhZywgaWYgYW55ICovXHJcbiAgICBwdWJsaWMgZ2V0UGlja2VyKHhtbFRhZzogc3RyaW5nKSA6IFBpY2tlclxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBpY2tlcnNbeG1sVGFnXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZSBFU0M6IGNsb3NlcyBhbiBvcGVuIHBpY2tlciBvciB0aGUgc2V0dGluZ3Mgc2NyZWVuLiBXaXRoIG5vdGhpbmdcclxuICAgICAqIGVsc2Ugb3BlbiwgaW4gdGhlIGRhc2hib2FyZCByb2xlIGl0IGFza3MgdG8gbGVhdmUgdGhlIHN0ZXAgZWRpdG9yIHZpZXdcclxuICAgICAqIOKAlCB0aGUgZGFzaGJvYXJkIGNvbmZpcm1zIGZpcnN0IGlmIHRoZXJlIGFyZSB1bnNhdmVkIGNoYW5nZXMuIE9uZSBsYXllclxyXG4gICAgICogcGVyIHByZXNzLCBzbyBkaXNtaXNzaW5nIGEgcGlja2VyIGRvZXMgbm90IGxlYXZlIHRoZSBlZGl0b3Igd2l0aCBpdC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoZXYua2V5ICE9PSAnRXNjYXBlJylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgbGF5ZXJPcGVuID0gISFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGlja2VyOm5vdChbaGlkZGVuXSknKVxyXG4gICAgICAgICAgICB8fCAhKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nc1NjcmVlbicpIGFzIEhUTUxFbGVtZW50KS5oaWRkZW47XHJcblxyXG4gICAgICAgIHRoaXMuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncy5jbG9zZSgpO1xyXG5cclxuICAgICAgICBpZiAoIWxheWVyT3BlbiAmJiBSQUcuaXNEYXNoYm9hcmRSb2xlKCkgJiYgUkFHLmRhc2hib2FyZCAmJiBSQUcuZGFzaGJvYXJkLmVkaXRpbmcpXHJcbiAgICAgICAgICAgIFJBRy5kYXNoYm9hcmQucmVxdWVzdENsb3NlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLyBHbG9iYWwgbWV0aG9kcyBmb3IgYXNzZXJ0aW5nIHRoZSBleGlzdGVuY2Ugb2YgdmFsdWVzLiBUbyBrZWVwIHRoZSBjaGFuY2Ugb2YgZXJyb3JzXHJcbi8vIHdpdGhpbiBhc3NlcnRzIGxvdywgbm8gbG9jYWxpemF0aW9uIGlzIHVzZWQgaGVyZS5cclxuXHJcbi8qKiBBc3NlcnRzIHRoYXQgdGhlIGdpdmVuIHZhbHVlIGV4aXN0czsgbmVpdGhlciB1bmRlZmluZWQgbm9yIG51bGwgKi9cclxuZnVuY3Rpb24gYXNzZXJ0PFQ+KHZhbHVlOiBUKSA6IFRcclxue1xyXG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpXHJcbiAgICAgICAgdGhyb3cgQXNzZXJ0RXJyb3IoJ1ZhbHVlIGRvZXMgbm90IGV4aXN0JywgYXNzZXJ0KTtcclxuXHJcbiAgICByZXR1cm4gdmFsdWU7XHJcbn1cclxuXHJcbi8qKiBBc3NlcnRzIHRoYXQgdGhlIGdpdmVuIHZhbHVlIGV4aXN0cyBhbmQgaXMgYSBudW1iZXIgKi9cclxuZnVuY3Rpb24gYXNzZXJ0TnVtYmVyKHZhbHVlOiBudW1iZXIpIDogdm9pZFxyXG57XHJcbiAgICBpZiAoIHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicgfHwgaXNOYU4odmFsdWUpIClcclxuICAgICAgICB0aHJvdyBBc3NlcnRFcnJvcignVmFsdWUgaXMgbm90IGEgbnVtYmVyJywgYXNzZXJ0TnVtYmVyKTtcclxufVxyXG5cclxuLyoqIENyZWF0ZXMgYW4gYXNzZXJ0aW9uIGVycm9yIHRoYXQgYmVnaW5zIHRoZSBzdGFjayBhdCB0aGUgYXNzZXJ0J3MgY2FsbCBzaXRlICAqL1xyXG5mdW5jdGlvbiBBc3NlcnRFcnJvcihtZXNzYWdlOiBhbnksIGNhbGxlcjogRnVuY3Rpb24pIDogRXJyb3Jcclxue1xyXG4gICAgbGV0IGVycm9yID0gRXJyb3IoYEFzc2VydGlvbiBmYWlsZWQ6ICR7bWVzc2FnZX1gKTtcclxuXHJcbiAgICBpZiAoRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpXHJcbiAgICAgICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UoZXJyb3IsIGNhbGxlcik7XHJcblxyXG4gICAgcmV0dXJuIGVycm9yO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIGNvbGxhcHNpYmxlIGVsZW1lbnRzICovXHJcbmNsYXNzIENvbGxhcHNpYmxlc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc3BhbiBUaGUgZW5jYXBzdWxhdGluZyBjb2xsYXBzaWJsZSBlbGVtZW50XHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVHJ1ZSB0byBjb2xsYXBzZSwgZmFsc2UgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldChzcGFuOiBIVE1MRWxlbWVudCwgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmIChzdGF0ZSkgc3Bhbi5zZXRBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcsICcnKTtcclxuICAgICAgICBlbHNlICAgICAgIHNwYW4ucmVtb3ZlQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBTdWdhciBmb3IgY2hvb3Npbmcgc2Vjb25kIHZhbHVlIGlmIGZpcnN0IGlzIHVuZGVmaW5lZCwgaW5zdGVhZCBvZiBmYWxzeSAqL1xyXG5mdW5jdGlvbiBlaXRoZXI8VD4odmFsdWU6IFQgfCB1bmRlZmluZWQsIHZhbHVlMjogVCkgOiBUXHJcbntcclxuICAgIHJldHVybiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgPyB2YWx1ZTIgOiB2YWx1ZTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCB0aGUgRE9NICovXHJcbmNsYXNzIERPTVxyXG57XHJcbiAgICAvKiogV2hldGhlciB0aGUgd2luZG93IGlzIHRoaW5uZXIgdGhhbiBhIHNwZWNpZmljIHNpemUgKGFuZCwgdGh1cywgaXMgXCJtb2JpbGVcIikgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzTW9iaWxlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGggPD0gNTAwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIFJBRyBhcHBlYXJzIHRvIGJlIHJ1bm5pbmcgb24gYW4gaU9TIGRldmljZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaXNpT1MoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLnBsYXRmb3JtLm1hdGNoKC9pUGhvbmV8aVBvZHxpUGFkL2dpKSAhPT0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gYXR0cmlidXRlIGZyb20gdGhlIGdpdmVuIGVsZW1lbnQsIG9yIHJldHVybnMgdGhlIGdpdmVuXHJcbiAgICAgKiBkZWZhdWx0IHZhbHVlIGlmIHVuc2V0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBhdHRyIE5hbWUgb2YgdGhlIGF0dHJpYnV0ZSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcGFyYW0gZGVmIERlZmF1bHQgdmFsdWUgaWYgYXR0cmlidXRlIGlzbid0IHNldFxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGF0dHJpYnV0ZSdzIHZhbHVlLCBvciBkZWZhdWx0IHZhbHVlIGlmIHVuc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0QXR0cihlbGVtZW50OiBIVE1MRWxlbWVudCwgYXR0cjogc3RyaW5nLCBkZWY6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cilcclxuICAgICAgICAgICAgPyBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSFcclxuICAgICAgICAgICAgOiBkZWY7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyBhbiBlbGVtZW50IGZyb20gdGhlIGdpdmVuIGRvY3VtZW50LCB0aHJvd2luZyBhbiBlcnJvciBpZiBubyBtYXRjaCBpcyBmb3VuZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgQ1NTIHNlbGVjdG9yIHF1ZXJ5IHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHBhcmVudCBQYXJlbnQgb2JqZWN0IHRvIHNlYXJjaDsgZGVmYXVsdHMgdG8gZG9jdW1lbnRcclxuICAgICAqIEByZXR1cm5zIFRoZSBmaXJzdCBlbGVtZW50IHRvIG1hdGNoIHRoZSBnaXZlbiBxdWVyeVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmU8VCBleHRlbmRzIEhUTUxFbGVtZW50PlxyXG4gICAgICAgIChxdWVyeTogc3RyaW5nLCBwYXJlbnQ6IFBhcmVudE5vZGUgPSB3aW5kb3cuZG9jdW1lbnQpIDogVFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBwYXJlbnQucXVlcnlTZWxlY3RvcihxdWVyeSkgYXMgVDtcclxuXHJcbiAgICAgICAgaWYgKCFyZXN1bHQpXHJcbiAgICAgICAgICAgIHRocm93IEFzc2VydEVycm9yKEwuRE9NX01JU1NJTkcocXVlcnkpLCBET00ucmVxdWlyZSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCB0aHJvd2luZyBhbiBlcnJvclxyXG4gICAgICogaWYgdGhlIGF0dHJpYnV0ZSBpcyBtaXNzaW5nLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBhdHRyIE5hbWUgb2YgdGhlIGF0dHJpYnV0ZSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gYXR0cmlidXRlJ3MgdmFsdWVcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlQXR0cihlbGVtZW50OiBIVE1MRWxlbWVudCwgYXR0cjogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICggIWVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpIClcclxuICAgICAgICAgICAgdGhyb3cgQXNzZXJ0RXJyb3IoTC5BVFRSX01JU1NJTkcoYXR0ciksIERPTS5yZXF1aXJlQXR0cik7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGtleSBvZiB0aGUgZ2l2ZW4gZWxlbWVudCdzIGRhdGFzZXQsIHRocm93aW5nIGFuIGVycm9yXHJcbiAgICAgKiBpZiB0aGUgdmFsdWUgaXMgbWlzc2luZyBvciBlbXB0eS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgZGF0YSBvZlxyXG4gICAgICogQHBhcmFtIGtleSBLZXkgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGRhdGFzZXQncyB2YWx1ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmVEYXRhKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBrZXk6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgdmFsdWUgPSBlbGVtZW50LmRhdGFzZXRba2V5XTtcclxuXHJcbiAgICAgICAgaWYgKCBTdHJpbmdzLmlzTnVsbE9yRW1wdHkodmFsdWUpIClcclxuICAgICAgICAgICAgdGhyb3cgQXNzZXJ0RXJyb3IoTC5EQVRBX01JU1NJTkcoa2V5KSwgRE9NLnJlcXVpcmVEYXRhKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHZhbHVlITtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJsdXJzICh1bmZvY3VzZXMpIHRoZSBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwYXJlbnQgSWYgZ2l2ZW4sIG9ubHkgYmx1cnMgaWYgYWN0aXZlIGlzIGRlc2NlbmRhbnRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBibHVyQWN0aXZlKHBhcmVudDogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5ib2R5KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgYWN0aXZlID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCBhY3RpdmUgJiYgYWN0aXZlLmJsdXIgJiYgcGFyZW50LmNvbnRhaW5zKGFjdGl2ZSkgKVxyXG4gICAgICAgICAgICBhY3RpdmUuYmx1cigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRGVlcCBjbG9uZXMgYWxsIHRoZSBjaGlsZHJlbiBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgaW50byB0aGUgdGFyZ2V0IGVsZW1lbnQuXHJcbiAgICAgKiBVc2luZyBpbm5lckhUTUwgd291bGQgYmUgZWFzaWVyLCBob3dldmVyIGl0IGhhbmRsZXMgc2VsZi1jbG9zaW5nIHRhZ3MgcG9vcmx5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzb3VyY2UgRWxlbWVudCB3aG9zZSBjaGlsZHJlbiB0byBjbG9uZVxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFbGVtZW50IHRvIGFwcGVuZCB0aGUgY2xvbmVkIGNoaWxkcmVuIHRvXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xvbmVJbnRvKHNvdXJjZTogSFRNTEVsZW1lbnQsIHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc291cmNlLmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHRhcmdldC5hcHBlbmRDaGlsZCggc291cmNlLmNoaWxkTm9kZXNbaV0uY2xvbmVOb2RlKHRydWUpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdWdhciBmb3IgY3JlYXRpbmcgYW5kIGFkZGluZyBhbiBvcHRpb24gZWxlbWVudCB0byBhIHNlbGVjdCBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzZWxlY3QgU2VsZWN0IGxpc3QgZWxlbWVudCB0byBhZGQgdGhlIG9wdGlvbiB0b1xyXG4gICAgICogQHBhcmFtIHRleHQgTGFiZWwgZm9yIHRoZSBvcHRpb25cclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSBmb3IgdGhlIG9wdGlvblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFkZE9wdGlvbihzZWxlY3Q6IEhUTUxTZWxlY3RFbGVtZW50LCB0ZXh0OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgPSAnJylcclxuICAgICAgICA6IEhUTUxPcHRpb25FbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpIGFzIEhUTUxPcHRpb25FbGVtZW50O1xyXG5cclxuICAgICAgICBvcHRpb24udGV4dCAgPSB0ZXh0O1xyXG4gICAgICAgIG9wdGlvbi52YWx1ZSA9IHZhbHVlO1xyXG5cclxuICAgICAgICBzZWxlY3QuYWRkKG9wdGlvbik7XHJcbiAgICAgICAgcmV0dXJuIG9wdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1Z2FyIGZvciBwb3B1bGF0aW5nIGEgc2VsZWN0IGVsZW1lbnQgd2l0aCBpdGVtcyBmcm9tIGEgZ2l2ZW4gb2JqZWN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBsaXN0IFNlbGVjdCBlbGVtZW50IHRvIHBvcHVsYXRlXHJcbiAgICAgKiBAcGFyYW0gaXRlbXMgQSBkaWN0aW9uYXJ5IHdoZXJlIGtleXMgYWN0IGxpa2UgdmFsdWVzLCBhbmQgdmFsdWVzIGxpa2UgbGFiZWxzXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0ZWQgSWYgbWF0Y2hlcyBhIGRpY3Rpb25hcnkga2V5LCB0aGF0IGtleSBpcyB0aGUgcHJlLXNlbGVjdGVkIG9wdGlvblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBvcHVsYXRlKGxpc3Q6IEhUTUxTZWxlY3RFbGVtZW50LCBpdGVtczogYW55LCBzZWxlY3RlZD86IGFueSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgdmFsdWUgaW4gaXRlbXMpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFiZWwgPSBpdGVtc1t2YWx1ZV07XHJcbiAgICAgICAgICAgIGxldCBvcHQgICA9IERPTS5hZGRPcHRpb24obGlzdCwgbGFiZWwsIHZhbHVlKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChzZWxlY3RlZCAhPT0gdW5kZWZpbmVkICYmIHZhbHVlID09PSBzZWxlY3RlZClcclxuICAgICAgICAgICAgICAgIG9wdC5zZWxlY3RlZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBnaXZlbiBlbGVtZW50LCBleGNsdWRpbmcgdGhlIHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuLlxyXG4gICAgICogQmUgd2FybmVkOyB0aGlzIG1ldGhvZCB1c2VzIFJBRy1zcGVjaWZpYyBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE5OTg2MzI4XHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHJlY3Vyc2l2ZWx5IGdldCB0ZXh0IGNvbnRlbnQgb2ZcclxuICAgICAqIEByZXR1cm5zIFRleHQgY29udGVudCBvZiBnaXZlbiBlbGVtZW50LCB3aXRob3V0IHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0VmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAgICAgIChlbGVtZW50Lm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQgfHwgJyc7XHJcbiAgICAgICAgZWxzZSBpZiAoIGVsZW1lbnQudGFnTmFtZSA9PT0gJ0JVVFRPTicgKVxyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcblxyXG4gICAgICAgIC8vIFJldHVybiBibGFuayAoc2tpcCkgaWYgY2hpbGQgb2YgYSBjb2xsYXBzZWQgZWxlbWVudC4gUHJldmlvdXNseSwgdGhpcyB1c2VkXHJcbiAgICAgICAgLy8gZ2V0Q29tcHV0ZWRTdHlsZSwgYnV0IHRoYXQgZG9lc24ndCB3b3JrIGlmIHRoZSBlbGVtZW50IGlzIHBhcnQgb2YgYW4gb3JwaGFuZWRcclxuICAgICAgICAvLyBwaHJhc2UgKGFzIGhhcHBlbnMgd2l0aCB0aGUgcGhyYXNlc2V0IHBpY2tlcikuXHJcbiAgICAgICAgbGV0IHBhcmVudCA9IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCBwYXJlbnQgJiYgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJykgKVxyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcblxyXG4gICAgICAgIGxldCB0ZXh0ID0gJyc7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50LmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHRleHQgKz0gRE9NLmdldFZpc2libGVUZXh0KGVsZW1lbnQuY2hpbGROb2Rlc1tpXSBhcyBFbGVtZW50KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4sXHJcbiAgICAgKiBhbmQgZXhjZXNzIHdoaXRlc3BhY2UgYXMgYSByZXN1bHQgb2YgY29udmVydGluZyBmcm9tIEhUTUwvWE1MLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE5OTg2MzI4XHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHJlY3Vyc2l2ZWx5IGdldCB0ZXh0IGNvbnRlbnQgb2ZcclxuICAgICAqIEByZXR1cm5zIENsZWFuZWQgdGV4dCBvZiBnaXZlbiBlbGVtZW50LCB3aXRob3V0IHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0Q2xlYW5lZFZpc2libGVUZXh0KGVsZW1lbnQ6IEVsZW1lbnQpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFN0cmluZ3MuY2xlYW4oIERPTS5nZXRWaXNpYmxlVGV4dChlbGVtZW50KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2NhbnMgZm9yIHRoZSBuZXh0IGZvY3VzYWJsZSBzaWJsaW5nIGZyb20gYSBnaXZlbiBlbGVtZW50LCBza2lwcGluZyBoaWRkZW4gb3JcclxuICAgICAqIHVuZm9jdXNhYmxlIGVsZW1lbnRzLiBJZiB0aGUgZW5kIG9mIHRoZSBjb250YWluZXIgaXMgaGl0LCB0aGUgc2NhbiB3cmFwcyBhcm91bmQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGZyb20gRWxlbWVudCB0byBzdGFydCBzY2FubmluZyBmcm9tXHJcbiAgICAgKiBAcGFyYW0gZGlyIERpcmVjdGlvbjsgLTEgZm9yIGxlZnQgKHByZXZpb3VzKSwgMSBmb3IgcmlnaHQgKG5leHQpXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbmV4dCBhdmFpbGFibGUgc2libGluZywgb3IgbnVsbCBpZiBub25lIGZvdW5kXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZnJvbTogSFRNTEVsZW1lbnQsIGRpcjogbnVtYmVyKVxyXG4gICAgICAgIDogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGRpciA9PT0gMClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuQkFEX0RJUkVDVElPTihkaXIpICk7XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50ID0gZnJvbTtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZyb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCFwYXJlbnQpXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICB3aGlsZSAodHJ1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFByb2NlZWQgdG8gbmV4dCBlbGVtZW50LCBvciB3cmFwIGFyb3VuZCBpZiBoaXQgdGhlIGVuZCBvZiBwYXJlbnRcclxuICAgICAgICAgICAgaWYgICAgICAoZGlyIDwgMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID4gMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHBhcmVudC5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGNvbWUgYmFjayB0byB0aGUgc3RhcnRpbmcgZWxlbWVudCwgbm90aGluZyB3YXMgZm91bmRcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09IGZyb20pXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMgZWxlbWVudCBpc24ndCBoaWRkZW4gYW5kIGlzIGZvY3VzYWJsZSwgcmV0dXJuIGl0IVxyXG4gICAgICAgICAgICBpZiAoICFjdXJyZW50LmhpZGRlbiApXHJcbiAgICAgICAgICAgIGlmICggY3VycmVudC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4JykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBlbGVtZW50LCByZWxldmFudCB0byBpdHMgcGFyZW50LlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIGVsZW1lbnQgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluZGV4T2YoY2hpbGQ6IEhUTUxFbGVtZW50KSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBub2RlLCByZWxldmFudCB0byBpdHMgcGFyZW50LiBVc2VkIGZvciB0ZXh0IG5vZGVzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIG5vZGUgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5vZGVJbmRleE9mKGNoaWxkOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGROb2RlcywgY2hpbGQpXHJcbiAgICAgICAgICAgIDogLTE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBhbmQgYWxsIGl0cyBsYWJlbHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byB0b2dnbGUgdGhlIGhpZGRlbiBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBmb3JjZSBPcHRpb25hbCB2YWx1ZSB0byBmb3JjZSB0b2dnbGluZyB0b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRvZ2dsZUhpZGRlbihlbGVtZW50OiBIVE1MRWxlbWVudCwgZm9yY2U/OiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaGlkZGVuID0gIWVsZW1lbnQuaGlkZGVuO1xyXG5cclxuICAgICAgICAvLyBEbyBub3RoaW5nIGlmIGFscmVhZHkgdG9nZ2xlZCB0byB0aGUgZm9yY2VkIHN0YXRlXHJcbiAgICAgICAgaWYgKGhpZGRlbiA9PT0gZm9yY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgZWxlbWVudC5oaWRkZW4gPSBoaWRkZW47XHJcblxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtmb3I9JyR7ZWxlbWVudC5pZH0nXWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGwgPT4gKGwgYXMgSFRNTEVsZW1lbnQpLmhpZGRlbiA9IGhpZGRlbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mIGEgZ3JvdXAgb2YgZWxlbWVudHMsIGluIGJ1bGsuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGxpc3QgQW4gYXJyYXkgb2YgYXJndW1lbnQgcGFpcnMgZm9yIHt0b2dnbGVIaWRkZW59XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdG9nZ2xlSGlkZGVuQWxsKC4uLmxpc3Q6IFtIVE1MRWxlbWVudCwgYm9vbGVhbj9dW10pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxpc3QuZm9yRWFjaCggbCA9PiB0aGlzLnRvZ2dsZUhpZGRlbiguLi5sKSApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEEgdmVyeSBzbWFsbCBzdWJzZXQgb2YgTWFya2Rvd24gZm9yIGh5cGVybGlua2luZyBhIGJsb2NrIG9mIHRleHQgKi9cclxuY2xhc3MgTGlua2Rvd25cclxue1xyXG4gICAgLyoqIFJlZ2V4IHBhdHRlcm4gZm9yIG1hdGNoaW5nIGxpbmtlZCB0ZXh0ICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUdFWF9MSU5LID0gL1xcWyhbXFxzXFxTXSs/KVxcXVxcWyhcXGQrKVxcXS9nbWk7XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGluayByZWZlcmVuY2VzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUdFWF9SRUYgID0gL15cXFsoXFxkKylcXF06XFxzKyhcXFMrKSQvZ21pO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXR0ZW1wdHMgdG8gbG9hZCB0aGUgZ2l2ZW4gbGlua2Rvd24gZmlsZSwgcGFyc2UgYW5kIHNldCBpdCBhcyBhbiBlbGVtZW50J3MgdGV4dC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGF0aCBSZWxhdGl2ZSBvciBhYnNvbHV0ZSBVUkwgdG8gZmV0Y2ggdGhlIGxpbmtkb3duIGZyb21cclxuICAgICAqIEBwYXJhbSBxdWVyeSBET00gcXVlcnkgZm9yIHRoZSBvYmplY3QgdG8gcHV0IHRoZSB0ZXh0IGludG9cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBsb2FkSW50byhwYXRoOiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBkb20gPSBET00ucmVxdWlyZShxdWVyeSk7XHJcblxyXG4gICAgICAgIGRvbS5pbm5lclRleHQgPSBgTG9hZGluZyB0ZXh0IGZyb20gJyR7cGF0aH0nLi4uYDtcclxuXHJcbiAgICAgICAgZmV0Y2gocGF0aClcclxuICAgICAgICAgICAgLnRoZW4oIHJlcSA9PiByZXEudGV4dCgpIClcclxuICAgICAgICAgICAgLnRoZW4oIHR4dCA9PiBkb20uaW5uZXJIVE1MID0gTGlua2Rvd24ucGFyc2UodHh0KSApXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gZG9tLmlubmVyVGV4dCA9IGBDb3VsZCBub3QgbG9hZCAnJHtwYXRofSc6ICR7ZXJyfWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGFyc2VzIHRoZSBnaXZlbiB0ZXh0IGZyb20gTGlua2Rvd24gdG8gSFRNTCwgY29udmVydGluZyB0YWdnZWQgdGV4dCBpbnRvIGxpbmtzXHJcbiAgICAgKiB1c2luZyBhIGdpdmVuIGxpc3Qgb2YgcmVmZXJlbmNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGV4dCBMaW5rZG93biB0ZXh0IHRvIHRyYW5zZm9ybSB0byBIVE1MXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHBhcnNlKHRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgbGlua3MgOiBEaWN0aW9uYXJ5PHN0cmluZz4gPSB7fTtcclxuXHJcbiAgICAgICAgLy8gRmlyc3QsIHNhbml0aXplIGFueSBIVE1MXHJcbiAgICAgICAgdGV4dCA9IHRleHQucmVwbGFjZSgnPCcsICcmbHQ7JykucmVwbGFjZSgnPicsICcmZ3Q7Jyk7XHJcblxyXG4gICAgICAgIC8vIFRoZW4sIGdldCB0aGUgbGlzdCBvZiByZWZlcmVuY2VzLCByZW1vdmluZyB0aGVtIGZyb20gdGhlIHRleHRcclxuICAgICAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKHRoaXMuUkVHRVhfUkVGLCAoXywgaywgdikgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxpbmtzW2tdID0gdjtcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5hbGx5LCByZXBsYWNlIGVhY2ggdGFnZ2VkIHBhcnQgb2YgdGV4dCB3aXRoIGEgbGluayBlbGVtZW50LiBJZiBhIHRhZyBoYXNcclxuICAgICAgICAvLyBhbiBpbnZhbGlkIHJlZmVyZW5jZSwgaXQgaXMgaWdub3JlZC5cclxuICAgICAgICByZXR1cm4gdGV4dC5yZXBsYWNlKHRoaXMuUkVHRVhfTElOSywgKG1hdGNoLCB0LCBrKSA9PlxyXG4gICAgICAgICAgICBsaW5rc1trXVxyXG4gICAgICAgICAgICAgICAgPyBgPGEgaHJlZj0nJHtsaW5rc1trXX0nIHRhcmdldD1cIl9ibGFua1wiIHJlbD1cIm5vb3BlbmVyXCI+JHt0fTwvYT5gXHJcbiAgICAgICAgICAgICAgICA6IG1hdGNoXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIHBhcnNpbmcgZGF0YSBmcm9tIHN0cmluZ3MgKi9cclxuY2xhc3MgUGFyc2Vcclxue1xyXG4gICAgLyoqIFBhcnNlcyBhIGdpdmVuIHN0cmluZyBpbnRvIGEgYm9vbGVhbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sZWFuKHN0cjogc3RyaW5nKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBzdHIgPSBzdHIudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ3RydWUnICB8fCBzdHIgPT09ICcxJylcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ2ZhbHNlJyB8fCBzdHIgPT09ICcwJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB0aHJvdyBFcnJvciggTC5CQURfQk9PTEVBTihzdHIpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBnZW5lcmF0aW5nIHJhbmRvbSBkYXRhICovXHJcbmNsYXNzIFJhbmRvbVxyXG57XHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIGEgcmFuZG9tIGludGVnZXIgZnJvbSB0aGUgZ2l2ZW4gcmFuZ2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIG1pbiBNaW5pbXVtIGludGVnZXIgdG8gcGljaywgaW5jbHVzaXZlXHJcbiAgICAgKiBAcGFyYW0gbWF4IE1heGltdW0gaW50ZWdlciB0byBwaWNrLCBpbmNsdXNpdmVcclxuICAgICAqIEByZXR1cm5zIFJhbmRvbSBpbnRlZ2VyIHdpdGhpbiB0aGUgZ2l2ZW4gcmFuZ2VcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbnQobWluOiBudW1iZXIgPSAwLCBtYXg6IG51bWJlciA9IDEpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIE1hdGgucm91bmQoIE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluKSApICsgbWluO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBlbGVtZW50IGZyb20gYSBnaXZlbiBhcnJheS1saWtlIG9iamVjdCB3aXRoIGEgbGVuZ3RoIHByb3BlcnR5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFycmF5KGFycjogTGVuZ3RoYWJsZSkgOiBhbnlcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gYXJyWyBSYW5kb20uaW50KDAsIGFyci5sZW5ndGggLSAxKSBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTcGxpY2VzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFycmF5U3BsaWNlPFQ+KGFycjogVFtdKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gYXJyLnNwbGljZShSYW5kb20uaW50KDAsIGFyci5sZW5ndGggLSAxKSwgMSlbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGtleSBmcm9tIGEgZ2l2ZW4gb2JqZWN0ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG9iamVjdEtleShvYmo6IHt9KSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkoIE9iamVjdC5rZXlzKG9iaikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIHRydWUgb3IgZmFsc2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2Ugb3V0IG9mIDEwMCwgdG8gcGljayBgdHJ1ZWBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sKGNoYW5jZTogbnVtYmVyID0gNTApIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uaW50KDAsIDEwMCkgPCBjaGFuY2U7XHJcbiAgICB9XHJcbn1cclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIGF1ZGlvIGZ1bmN0aW9uYWxpdHkgKi9cclxuY2xhc3MgU291bmRzXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogRGVjb2RlcyB0aGUgZ2l2ZW4gYXVkaW8gZmlsZSBpbnRvIHJhdyBhdWRpbyBkYXRhLiBUaGlzIGlzIGEgd3JhcHBlciBmb3IgdGhlIG9sZGVyXHJcbiAgICAgKiBjYWxsYmFjay1iYXNlZCBzeW50YXgsIHNpbmNlIGl0IGlzIHRoZSBvbmx5IG9uZSBpT1MgY3VycmVudGx5IHN1cHBvcnRzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IEF1ZGlvIGNvbnRleHQgdG8gdXNlIGZvciBkZWNvZGluZ1xyXG4gICAgICogQHBhcmFtIGJ1ZmZlciBCdWZmZXIgb2YgZW5jb2RlZCBmaWxlIGRhdGEgKGUuZy4gbXAzKSB0byBkZWNvZGVcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhc3luYyBkZWNvZGUoY29udGV4dDogQXVkaW9Db250ZXh0LCBidWZmZXI6IEFycmF5QnVmZmVyKVxyXG4gICAgICAgIDogUHJvbWlzZTxBdWRpb0J1ZmZlcj5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UgPEF1ZGlvQnVmZmVyPiAoIChyZXNvbHZlLCByZWplY3QpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICByZXR1cm4gY29udGV4dC5kZWNvZGVBdWRpb0RhdGEoYnVmZmVyLCByZXNvbHZlLCByZWplY3QpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHN0cmluZ3MgKi9cclxuY2xhc3MgU3RyaW5nc1xyXG57XHJcbiAgICAvKiogQ2hlY2tzIGlmIHRoZSBnaXZlbiBzdHJpbmcgaXMgbnVsbCwgb3IgZW1wdHkgKHdoaXRlc3BhY2Ugb25seSBvciB6ZXJvLWxlbmd0aCkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNOdWxsT3JFbXB0eShzdHI6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiAhc3RyIHx8ICFzdHIudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50J3MgYSBnaXZlbiBsaXN0IG9mIHN0YXRpb25zLCB3aXRoIGNvbnRleHQgc2Vuc2l0aXZlIGV4dHJhcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgTGlzdCBvZiBzdGF0aW9uIGNvZGVzIHRvIGpvaW5cclxuICAgICAqIEBwYXJhbSBjb250ZXh0IExpc3QncyBjb250ZXh0LiBJZiAnY2FsbGluZycsIGhhbmRsZXMgc3BlY2lhbCBjYXNlXHJcbiAgICAgKiBAcmV0dXJucyBQcmV0dHktcHJpbnRlZCBsaXN0IG9mIGdpdmVuIHN0YXRpb25zXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVN0YXRpb25MaXN0KGNvZGVzOiBzdHJpbmdbXSwgY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSAnJztcclxuICAgICAgICBsZXQgbmFtZXMgID0gY29kZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgbmFtZXMuZm9yRWFjaCggKGMsIGkpID0+IG5hbWVzW2ldID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oYykgKTtcclxuXHJcbiAgICAgICAgaWYgKG5hbWVzLmxlbmd0aCA9PT0gMSlcclxuICAgICAgICAgICAgcmVzdWx0ID0gKGNvbnRleHQgPT09ICdjYWxsaW5nJylcclxuICAgICAgICAgICAgICAgID8gYCR7bmFtZXNbMF19IG9ubHlgXHJcbiAgICAgICAgICAgICAgICA6IG5hbWVzWzBdO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsYXN0U3RhdGlvbiA9IG5hbWVzLnBvcCgpO1xyXG5cclxuICAgICAgICAgICAgcmVzdWx0ICA9IG5hbWVzLmpvaW4oJywgJyk7XHJcbiAgICAgICAgICAgIHJlc3VsdCArPSBgIGFuZCAke2xhc3RTdGF0aW9ufWA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50cyB0aGUgZ2l2ZW4gZGF0ZSBvciBob3VycyBhbmQgbWludXRlcyBpbnRvIGEgMjQtaG91ciB0aW1lIChlLmcuIDAxOjA5KS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaG91cnMgSG91cnMsIGZyb20gMCB0byAyMywgb3IgRGF0ZSBvYmplY3RcclxuICAgICAqIEBwYXJhbSBtaW51dGVzIE1pbnV0ZXMsIGZyb20gMCB0byA1OVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21UaW1lKGhvdXJzOiBudW1iZXIgfCBEYXRlLCBtaW51dGVzOiBudW1iZXIgPSAwKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmIChob3VycyBpbnN0YW5jZW9mIERhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBtaW51dGVzID0gaG91cnMuZ2V0TWludXRlcygpO1xyXG4gICAgICAgICAgICBob3VycyAgID0gaG91cnMuZ2V0SG91cnMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBob3Vycy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJykgKyAnOicgK1xyXG4gICAgICAgICAgICBtaW51dGVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYW5zIHVwIHRoZSBnaXZlbiB0ZXh0IG9mIGV4Y2VzcyB3aGl0ZXNwYWNlIGFuZCBhbnkgbmV3bGluZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xlYW4odGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0ZXh0LnRyaW0oKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcblxccl0vZ2ksICAgJycgIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcc3syLH0vZ2ksICAgJyAnIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL+KAnFxccysvZ2ksICAgICAn4oCcJyApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMr4oCdL2dpLCAgICAgJ+KAnScgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzKFsuLF0pL2dpLCAnJDEnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3Ryb25nbHkgY29tcHJlc3NlcyB0aGUgZ2l2ZW4gc3RyaW5nIHRvIG9uZSBtb3JlIGZpbGVuYW1lIGZyaWVuZGx5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZpbGVuYW1lKHRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGV4dFxyXG4gICAgICAgICAgICAudG9Mb3dlckNhc2UoKVxyXG4gICAgICAgICAgICAvLyBSZXBsYWNlIHBsdXJhbHNcclxuICAgICAgICAgICAgLnJlcGxhY2UoL2llc1xcYi9nLCAneScpXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBjb21tb24gd29yZHNcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcYihhfGFufGF0fGJlfG9mfG9ufHRoZXx0b3xpbnxpc3xoYXN8Ynl8d2l0aClcXGIvZywgJycpXHJcbiAgICAgICAgICAgIC50cmltKClcclxuICAgICAgICAgICAgLy8gQ29udmVydCBzcGFjZXMgdG8gdW5kZXJzY29yZXNcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccysvZywgJ18nKVxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgYWxsIG5vbi1hbHBoYW51bWVyaWNhbHNcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1teYS16MC05X10vZywgJycpXHJcbiAgICAgICAgICAgIC8vIExpbWl0IHRvIDEwMCBjaGFyczsgbW9zdCBzeXN0ZW1zIHN1cHBvcnQgbWF4LiAyNTUgYnl0ZXMgaW4gZmlsZW5hbWVzXHJcbiAgICAgICAgICAgIC5zdWJzdHJpbmcoMCwgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgZmlyc3QgbWF0Y2ggb2YgYSBwYXR0ZXJuIGluIGEgc3RyaW5nLCBvciB1bmRlZmluZWQgaWYgbm90IGZvdW5kICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZpcnN0TWF0Y2godGV4dDogc3RyaW5nLCBwYXR0ZXJuOiBSZWdFeHAsIGlkeDogbnVtYmVyKVxyXG4gICAgICAgIDogc3RyaW5nIHwgdW5kZWZpbmVkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG1hdGNoID0gdGV4dC5tYXRjaChwYXR0ZXJuKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIChtYXRjaCAmJiBtYXRjaFtpZHhdKVxyXG4gICAgICAgICAgICA/IG1hdGNoW2lkeF1cclxuICAgICAgICAgICAgOiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgc3RhdGlvbiBuYW1lLCB3aGljaCBjYW4gYmUgYSBzaW1wbGUgc3RyaW5nIG9yIGNvbXBsZXggb2JqZWN0ICovXHJcbnR5cGUgU3RhdGlvbiA9IHN0cmluZyB8IFN0YXRpb25EZWY7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIGNvbXBsZXggc3RhdGlvbiBuYW1lIGRlZmluaXRpb24gKi9cclxuaW50ZXJmYWNlIFN0YXRpb25EZWZcclxue1xyXG4gICAgLyoqIENhbm9uaWNhbCBuYW1lIG9mIHRoZSBzdGF0aW9uICovXHJcbiAgICBuYW1lICAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogU3RhdGlvbiBjb2RlIHRvIHVzZSB0aGUgc2FtZSByZWNvcmRpbmcgb2YgKi9cclxuICAgIHZveEFsaWFzPyA6IHN0cmluZztcclxufVxyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBnZW5lcmljIGtleS12YWx1ZSBkaWN0aW9uYXJ5LCB3aXRoIHN0cmluZyBrZXlzICovXHJcbnR5cGUgRGljdGlvbmFyeTxUPiA9IHsgW2luZGV4OiBzdHJpbmddOiBUIH07XHJcblxyXG4vKiogRGVmaW5lcyB0aGUgZGF0YSByZWZlcmVuY2VzIGNvbmZpZyBvYmplY3QgcGFzc2VkIGludG8gUkFHLm1haW4gb24gaW5pdCAqL1xyXG5pbnRlcmZhY2UgRGF0YVJlZnNcclxue1xyXG4gICAgLyoqIFNlbGVjdG9yIGZvciBnZXR0aW5nIHRoZSBwaHJhc2Ugc2V0IFhNTCBJRnJhbWUgZWxlbWVudCAqL1xyXG4gICAgcGhyYXNlc2V0RW1iZWQgOiBzdHJpbmc7XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIGV4Y3VzZXMgZm9yIHRyYWluIGRlbGF5cyBvciBjYW5jZWxsYXRpb25zIHRvIHVzZSAqL1xyXG4gICAgZXhjdXNlc0RhdGEgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNwZWNpYWwgdHJhaW5zIHRvIHVzZSAqL1xyXG4gICAgbmFtZWREYXRhICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNlcnZpY2VzL25ldHdvcmtzIHRvIHVzZSAqL1xyXG4gICAgc2VydmljZXNEYXRhICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgZGljdGlvbmFyeSBvZiBzdGF0aW9uIGNvZGVzIGFuZCBuYW1lcyB0byB1c2UgKi9cclxuICAgIHN0YXRpb25zRGF0YSAgIDogRGljdGlvbmFyeTxzdHJpbmc+O1xyXG4gICAgLyoqXHJcbiAgICAgKiBSb2xlIHRoZSBwYWdlIGJvb3RzIGluLCBzZXQgYnkgdGhlIHBhZ2UncyBib290IHNjcmlwdDogJ2Rhc2hib2FyZCdcclxuICAgICAqIChjb250cm9sbGVyKSBvciAnZWRpdG9yJyAobWFpbiBzY3JlZW4pLiBXaGVuIGFic2VudCwgdGhlIHJvbGUgZmFsbHNcclxuICAgICAqIGJhY2sgdG8gdGhlIFVSTCBmbGFnIChpbmRleC5odG1sP2Rhc2hib2FyZD0xKS5cclxuICAgICAqL1xyXG4gICAgYm9vdFJvbGU/ICAgICAgOiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKiBGaWxsIGlucyBmb3IgdmFyaW91cyBtaXNzaW5nIGRlZmluaXRpb25zIG9mIG1vZGVybiBKYXZhc2NyaXB0IGZlYXR1cmVzICovXHJcblxyXG5pbnRlcmZhY2UgV2luZG93XHJcbntcclxuICAgIG9udW5oYW5kbGVkcmVqZWN0aW9uOiBFcnJvckV2ZW50SGFuZGxlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFycmF5PFQ+XHJcbntcclxuICAgIGluY2x1ZGVzKHNlYXJjaEVsZW1lbnQ6IFQsIGZyb21JbmRleD86IG51bWJlcikgOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRXJyb3JDb25zdHJ1Y3RvclxyXG57XHJcbiAgICBjYXB0dXJlU3RhY2tUcmFjZSh0YXJnZXQ6IGFueSwgY3Rvcj86IEZ1bmN0aW9uKSA6IHZvaWQ7XHJcbn1cclxuXHJcbmludGVyZmFjZSBIVE1MRWxlbWVudFxyXG57XHJcbiAgICBsYWJlbHMgOiBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFN0cmluZ1xyXG57XHJcbiAgICBwYWRTdGFydCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxuICAgIHBhZEVuZCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEF1ZGlvQ29udGV4dEJhc2Vcclxue1xyXG4gICAgYXVkaW9Xb3JrbGV0IDogQXVkaW9Xb3JrbGV0O1xyXG59XHJcblxyXG50eXBlIFNhbXBsZUNoYW5uZWxzID0gRmxvYXQzMkFycmF5W11bXTtcclxuXHJcbmRlY2xhcmUgY2xhc3MgQXVkaW9Xb3JrbGV0UHJvY2Vzc29yXHJcbntcclxuICAgIHN0YXRpYyBwYXJhbWV0ZXJEZXNjcmlwdG9ycyA6IEF1ZGlvUGFyYW1EZXNjcmlwdG9yW107XHJcblxyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKG9wdGlvbnM/OiBBdWRpb1dvcmtsZXROb2RlT3B0aW9ucyk7XHJcbiAgICByZWFkb25seSBwb3J0PzogTWVzc2FnZVBvcnQ7XHJcblxyXG4gICAgcHJvY2VzcyhcclxuICAgICAgICBpbnB1dHM6IFNhbXBsZUNoYW5uZWxzLFxyXG4gICAgICAgIG91dHB1dHM6IFNhbXBsZUNoYW5uZWxzLFxyXG4gICAgICAgIHBhcmFtZXRlcnM6IERpY3Rpb25hcnk8RmxvYXQzMkFycmF5PlxyXG4gICAgKSA6IGJvb2xlYW47XHJcbn1cclxuXHJcbmludGVyZmFjZSBBdWRpb1dvcmtsZXROb2RlT3B0aW9ucyBleHRlbmRzIEF1ZGlvTm9kZU9wdGlvbnNcclxue1xyXG4gICAgbnVtYmVyT2ZJbnB1dHM/IDogbnVtYmVyO1xyXG4gICAgbnVtYmVyT2ZPdXRwdXRzPyA6IG51bWJlcjtcclxuICAgIG91dHB1dENoYW5uZWxDb3VudD8gOiBudW1iZXJbXTtcclxuICAgIHBhcmFtZXRlckRhdGE/IDoge1tpbmRleDogc3RyaW5nXSA6IG51bWJlcn07XHJcbiAgICBwcm9jZXNzb3JPcHRpb25zPyA6IGFueTtcclxufVxyXG5cclxuaW50ZXJmYWNlIE1lZGlhVHJhY2tDb25zdHJhaW50U2V0XHJcbntcclxuICAgIGF1dG9HYWluQ29udHJvbD86IGJvb2xlYW4gfCBDb25zdHJhaW5Cb29sZWFuUGFyYW1ldGVycztcclxuICAgIG5vaXNlU3VwcHJlc3Npb24/OiBib29sZWFuIHwgQ29uc3RyYWluQm9vbGVhblBhcmFtZXRlcnM7XHJcbn1cclxuXHJcbmRlY2xhcmUgZnVuY3Rpb24gcmVnaXN0ZXJQcm9jZXNzb3IobmFtZTogc3RyaW5nLCBjdG9yOiBBdWRpb1dvcmtsZXRQcm9jZXNzb3IpIDogdm9pZDsiLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ3Jvc3Mtd2luZG93IGNvbW11bmljYXRpb24gY2hhbm5lbCB1c2luZyBCcm9hZGNhc3RDaGFubmVsICovXHJcbmNsYXNzIFNjZW5hcmlvQ2hhbm5lbFxyXG57XHJcbiAgICBwcml2YXRlIGNoYW5uZWw6IEJyb2FkY2FzdENoYW5uZWwgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgbGlzdGVuZXJzOiB7IFt0eXBlOiBzdHJpbmddOiBBcnJheTwoZGF0YTogYW55KSA9PiB2b2lkPiB9ID0ge307XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBpZiAodHlwZW9mIEJyb2FkY2FzdENoYW5uZWwgIT09ICd1bmRlZmluZWQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdHJ5XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hhbm5lbCA9IG5ldyBCcm9hZGNhc3RDaGFubmVsKCdyYWdfc2NlbmFyaW9fY2hhbm5lbCcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGFubmVsLm9ubWVzc2FnZSA9IChldmVudDogTWVzc2FnZUV2ZW50KSA9PlxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBtc2cgPSBldmVudC5kYXRhO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cgJiYgbXNnLnR5cGUpXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgaGFuZGxlcnMgPSB0aGlzLmxpc3RlbmVyc1ttc2cudHlwZV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoYW5kbGVycylcclxuICAgICAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlcnMuZm9yRWFjaChoID0+IGgobXNnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0Jyb2FkY2FzdENoYW5uZWwgbm90IHN1cHBvcnRlZCBvciBmYWlsZWQ6JywgZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIG9uKHR5cGU6IHN0cmluZywgaGFuZGxlcjogKGRhdGE6IGFueSkgPT4gdm9pZCk6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMubGlzdGVuZXJzW3R5cGVdKVxyXG4gICAgICAgICAgICB0aGlzLmxpc3RlbmVyc1t0eXBlXSA9IFtdO1xyXG5cclxuICAgICAgICB0aGlzLmxpc3RlbmVyc1t0eXBlXS5wdXNoKGhhbmRsZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBvZmYodHlwZTogc3RyaW5nLCBoYW5kbGVyOiAoZGF0YTogYW55KSA9PiB2b2lkKTogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBoYW5kbGVycyA9IHRoaXMubGlzdGVuZXJzW3R5cGVdO1xyXG4gICAgICAgIGlmICghaGFuZGxlcnMpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGkgPSBoYW5kbGVycy5pbmRleE9mKGhhbmRsZXIpO1xyXG4gICAgICAgIGlmIChpICE9PSAtMSlcclxuICAgICAgICAgICAgaGFuZGxlcnMuc3BsaWNlKGksIDEpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzZW5kKHR5cGU6IHN0cmluZywgcGF5bG9hZDogYW55ID0ge30pOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY2hhbm5lbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRyeVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5uZWwucG9zdE1lc3NhZ2UoT2JqZWN0LmFzc2lnbih7IHR5cGU6IHR5cGUgfSwgcGF5bG9hZCkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBzZW5kIEJyb2FkY2FzdENoYW5uZWwgbWVzc2FnZTonLCBlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuKHdpbmRvdyBhcyBhbnkpLlNjZW5hcmlvQ2hhbm5lbCA9IFNjZW5hcmlvQ2hhbm5lbDtcclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgZGF0YSBmb3IgZXhjdXNlcywgdHJhaW5zLCBzZXJ2aWNlcyBhbmQgc3RhdGlvbnMgKi9cclxuY2xhc3MgRGF0YWJhc2Vcclxue1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGV4Y3VzZXMgICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBuYW1lZCB0cmFpbnMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbmFtZWQgICAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIHNlcnZpY2Ugb3IgbmV0d29yayBuYW1lcyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXJ2aWNlcyAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBuYW1lcywgd2l0aCB0aHJlZS1sZXR0ZXIgY29kZSBrZXlzIChlLmcuIEFCQykgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc3RhdGlvbnMgICAgICA6IERpY3Rpb25hcnk8U3RhdGlvbj47XHJcbiAgICAvKiogTG9hZGVkIFhNTCBkb2N1bWVudCBjb250YWluaW5nIHBocmFzZXNldCBkYXRhICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHBocmFzZXNldHMgICAgOiBEb2N1bWVudDtcclxuICAgIC8qKiBBbW91bnQgb2Ygc3RhdGlvbnMgaW4gdGhlIGN1cnJlbnRseSBsb2FkZWQgZGF0YXNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzdGF0aW9uc0NvdW50IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihkYXRhUmVmczogRGF0YVJlZnMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICA9IGRhdGFSZWZzLnBocmFzZXNldEVtYmVkO1xyXG4gICAgICAgIGxldCBpZnJhbWUgPSBET00ucmVxdWlyZSA8SFRNTElGcmFtZUVsZW1lbnQ+IChxdWVyeSk7XHJcblxyXG4gICAgICAgIGlmICghaWZyYW1lLmNvbnRlbnREb2N1bWVudClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRShxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgdGhpcy5waHJhc2VzZXRzICAgID0gaWZyYW1lLmNvbnRlbnREb2N1bWVudDtcclxuICAgICAgICB0aGlzLmV4Y3VzZXMgICAgICAgPSBkYXRhUmVmcy5leGN1c2VzRGF0YTtcclxuICAgICAgICB0aGlzLm5hbWVkICAgICAgICAgPSBkYXRhUmVmcy5uYW1lZERhdGE7XHJcbiAgICAgICAgdGhpcy5zZXJ2aWNlcyAgICAgID0gZGF0YVJlZnMuc2VydmljZXNEYXRhO1xyXG4gICAgICAgIHRoaXMuc3RhdGlvbnMgICAgICA9IGRhdGFSZWZzLnN0YXRpb25zRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zQ291bnQgPSBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGg7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbRGF0YWJhc2VdIEVudHJpZXMgbG9hZGVkOicpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRFeGN1c2VzOicsICAgICAgdGhpcy5leGN1c2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdE5hbWVkIHRyYWluczonLCB0aGlzLm5hbWVkLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFNlcnZpY2VzOicsICAgICB0aGlzLnNlcnZpY2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFN0YXRpb25zOicsICAgICB0aGlzLnN0YXRpb25zQ291bnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBleGN1c2UgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgcGlja0V4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLmV4Y3VzZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHBpY2tOYW1lZCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsb25lcyBhbmQgZ2V0cyBwaHJhc2Ugd2l0aCB0aGUgZ2l2ZW4gSUQsIG9yIG51bGwgaWYgaXQgZG9lc24ndCBleGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZSB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZShpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlIycgKyBpZCkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmIChyZXN1bHQpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgcGhyYXNlc2V0IHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuIE5vdGUgdGhhdCB0aGVcclxuICAgICAqIHJldHVybmVkIHBocmFzZXNldCBjb21lcyBmcm9tIHRoZSBYTUwgZG9jdW1lbnQsIHNvIGl0IHNob3VsZCBub3QgYmUgbXV0YXRlZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZXNldCB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldChpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlc2V0IycgKyBpZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgcGlja1NlcnZpY2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5zZXJ2aWNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBzdGF0aW9uIGNvZGUgZnJvbSB0aGUgZGF0YXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZSBMaXN0IG9mIGNvZGVzIHRvIGV4Y2x1ZGUuIE1heSBiZSBpZ25vcmVkIGlmIHNlYXJjaCB0YWtlcyB0b28gbG9uZy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHBpY2tTdGF0aW9uQ29kZShleGNsdWRlPzogc3RyaW5nW10pIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgLy8gR2l2ZSB1cCBmaW5kaW5nIHJhbmRvbSBzdGF0aW9uIHRoYXQncyBub3QgaW4gdGhlIGdpdmVuIGxpc3QsIGlmIHdlIHRyeSBtb3JlXHJcbiAgICAgICAgLy8gdGltZXMgdGhlbiB0aGVyZSBhcmUgc3RhdGlvbnMuIEluYWNjdXJhdGUsIGJ1dCBhdm9pZHMgaW5maW5pdGUgbG9vcHMuXHJcbiAgICAgICAgaWYgKGV4Y2x1ZGUpIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdGF0aW9uc0NvdW50OyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCAhZXhjbHVkZS5pbmNsdWRlcyh2YWx1ZSkgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBzdGF0aW9uIG5hbWUgZnJvbSB0aGUgZ2l2ZW4gdGhyZWUgbGV0dGVyIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBnZXQgdGhlIG5hbWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFN0YXRpb24gbmFtZSBmb3IgdGhlIGdpdmVuIGNvZGVcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gdGhpcy5zdGF0aW9uc1tjb2RlXTtcclxuXHJcbiAgICAgICAgaWYgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9VTktOT1dOX1NUQVRJT04oY29kZSk7XHJcblxyXG4gICAgICAgIGlmICh0eXBlb2Ygc3RhdGlvbiA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmdzLmlzTnVsbE9yRW1wdHkoc3RhdGlvbilcclxuICAgICAgICAgICAgICAgID8gTC5EQl9FTVBUWV9TVEFUSU9OKGNvZGUpXHJcbiAgICAgICAgICAgICAgICA6IHN0YXRpb247XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gIXN0YXRpb24ubmFtZVxyXG4gICAgICAgICAgICAgICAgPyBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSlcclxuICAgICAgICAgICAgICAgIDogc3RhdGlvbi5uYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlJ3Mgdm94IGFsaWFzLCBpZiBhbnkuIEEgdm94IGFsaWFzIGlzIHRoZSBjb2RlIG9mIGFub3RoZXJcclxuICAgICAqIHN0YXRpb24ncyB2b2ljZSBmaWxlLCB0aGF0IHRoZSBnaXZlbiBjb2RlIHNob3VsZCB1c2UgaW5zdGVhZC4gVGhpcyBpcyB1c2VkIGZvclxyXG4gICAgICogc3RhdGlvbnMgd2l0aCBkdXBsaWNhdGUgbmFtZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIGdldCB0aGUgdm94IGFsaWFzIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgYWxpYXMgY29kZSwgZWxzZSB0aGUgZ2l2ZW4gY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvblZveChjb2RlOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSB0aGlzLnN0YXRpb25zW2NvZGVdO1xyXG5cclxuICAgICAgICAvLyBVbmtub3duIHN0YXRpb25cclxuICAgICAgICBpZiAgICAgICghc3RhdGlvbilcclxuICAgICAgICAgICAgcmV0dXJuICc/Pz8nO1xyXG4gICAgICAgIC8vIFN0YXRpb24gaXMganVzdCBhIHN0cmluZzsgYXNzdW1lIG5vIGFsaWFzXHJcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHN0YXRpb24gPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gY29kZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiBlaXRoZXIoc3RhdGlvbi52b3hBbGlhcywgY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSByYW5nZSBvZiBzdGF0aW9uIGNvZGVzLCBlbnN1cmluZyB0aGVyZSBhcmUgbm8gZHVwbGljYXRlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVcclxuICAgICAqIEByZXR1cm5zIEEgbGlzdCBvZiB1bmlxdWUgc3RhdGlvbiBuYW1lc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlcyhtaW4gPSAxLCBtYXggPSAxNiwgZXhjbHVkZT8gOiBzdHJpbmdbXSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChtYXggLSBtaW4gPiBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX1RPT19NQU5ZX1NUQVRJT05TKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGxlbmd0aCA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIGxldCB0cmllcyAgPSAwO1xyXG5cclxuICAgICAgICB3aGlsZSAocmVzdWx0Lmxlbmd0aCA8IGxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB1cCB0cnlpbmcgdG8gYXZvaWQgZHVwbGljYXRlcywgaWYgd2UgdHJ5IG1vcmUgdGltZXMgdGhhbiB0aGVyZSBhcmVcclxuICAgICAgICAgICAgLy8gc3RhdGlvbnMgYXZhaWxhYmxlLiBJbmFjY3VyYXRlLCBidXQgZ29vZCBlbm91Z2guXHJcbiAgICAgICAgICAgIGlmICh0cmllcysrID49IHRoaXMuc3RhdGlvbnNDb3VudClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhbiBleGNsdXNpb24gbGlzdCwgY2hlY2sgYWdhaW5zdCBib3RoIHRoYXQgYW5kIHJlc3VsdHNcclxuICAgICAgICAgICAgZWxzZSBpZiAoIGV4Y2x1ZGUgJiYgIWV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCwganVzdCBjaGVjayB3aGF0IHJlc3VsdHMgd2UndmUgYWxyZWFkeSBmb3VuZFxyXG4gICAgICAgICAgICBlbHNlIGlmICggIWV4Y2x1ZGUgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1haW4gY2xhc3Mgb2YgdGhlIGVudGlyZSBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yIGFwcGxpY2F0aW9uICovXHJcbmNsYXNzIFJBR1xyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgY29uZmlndXJhdGlvbiBjb250YWluZXIgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY29uZmlnICAgIDogQ29uZmlnO1xyXG4gICAgLyoqIEdldHMgdGhlIGRhdGFiYXNlIG1hbmFnZXIsIHdoaWNoIGhvbGRzIHBocmFzZSwgc3RhdGlvbiBhbmQgdHJhaW4gZGF0YSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBkYXRhYmFzZSAgOiBEYXRhYmFzZTtcclxuICAgIC8qKiBHZXRzIHRoZSBwaHJhc2UgbWFuYWdlciwgd2hpY2ggZ2VuZXJhdGVzIEhUTUwgcGhyYXNlcyBmcm9tIFhNTCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VyICAgOiBQaHJhc2VyO1xyXG4gICAgLyoqIEdldHMgdGhlIHNwZWVjaCBlbmdpbmUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3BlZWNoICAgIDogU3BlZWNoO1xyXG4gICAgLyoqIEdldHMgdGhlIGN1cnJlbnQgdHJhaW4gYW5kIHN0YXRpb24gc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGUgICAgIDogU3RhdGU7XHJcbiAgICAvKiogR2V0cyB0aGUgdmlldyBjb250cm9sbGVyLCB3aGljaCBtYW5hZ2VzIFVJIGludGVyYWN0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZpZXdzICAgICA6IFZpZXdzO1xyXG4gICAgLyoqIEdldHMgdGhlIHNjZW5hcmlvIHJ1bm5lciwgd2hpY2ggY2hhaW5zIGFubm91bmNlbWVudHMgaW50byBhIHNlcXVlbmNlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNjZW5hcmlvICA6IFNjZW5hcmlvO1xyXG4gICAgLyoqIEdldHMgdGhlIHNjZW5hcmlvIGRhc2hib2FyZCBjb250cm9sbGVyICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGRhc2hib2FyZCA6IFNjZW5hcmlvRGFzaGJvYXJkO1xyXG4gICAgLyoqIENyb3NzLXdpbmRvdyBtZXNzYWdpbmcgY2hhbm5lbCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjaGFubmVsICAgOiBTY2VuYXJpb0NoYW5uZWw7XHJcbiAgICAvKiogUm9sZSB0aGlzIHBhZ2UgYm9vdGVkIGluICgnZGFzaGJvYXJkJyAvICdlZGl0b3InKSwgZnJvbSB0aGUgYm9vdCBzY3JpcHQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vdFJvbGUgIDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFbnRyeSBwb2ludCBmb3IgUkFHLCB0byBiZSBjYWxsZWQgZnJvbSBKYXZhc2NyaXB0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBkYXRhUmVmcyBDb25maWd1cmF0aW9uIG9iamVjdCwgd2l0aCByYWlsIGRhdGEgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFpbihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5vbmVycm9yICAgICAgICAgICAgICA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcbiAgICAgICAgd2luZG93Lm9udW5oYW5kbGVkcmVqZWN0aW9uID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuXHJcbiAgICAgICAgUkFHLmJvb3RSb2xlID0gZGF0YVJlZnMuYm9vdFJvbGUgfHwgJyc7XHJcblxyXG4gICAgICAgIEkxOG4uaW5pdCgpO1xyXG5cclxuICAgICAgICBSQUcuY29uZmlnICAgID0gbmV3IENvbmZpZyh0cnVlKTtcclxuICAgICAgICBSQUcuZGF0YWJhc2UgID0gbmV3IERhdGFiYXNlKGRhdGFSZWZzKTtcclxuICAgICAgICBSQUcucGhyYXNlciAgID0gbmV3IFBocmFzZXIoKTtcclxuICAgICAgICBSQUcuc3BlZWNoICAgID0gbmV3IFNwZWVjaCgpO1xyXG4gICAgICAgIFJBRy5zY2VuYXJpbyAgPSBuZXcgU2NlbmFyaW8oKTtcclxuICAgICAgICBSQUcudmlld3MgICAgID0gbmV3IFZpZXdzKCk7XHJcbiAgICAgICAgUkFHLmRhc2hib2FyZCA9IG5ldyBTY2VuYXJpb0Rhc2hib2FyZCgpO1xyXG4gICAgICAgIFJBRy5jaGFubmVsICAgPSBuZXcgU2NlbmFyaW9DaGFubmVsKCk7XHJcblxyXG4gICAgICAgIC8vIFJlZ2lzdGVyIGNyb3NzLXdpbmRvdyBsaXN0ZW5lcnMgb24gbWFpbiBpbmRleC5odG1sIHBhZ2VcclxuICAgICAgICBSQUcucmVnaXN0ZXJDaGFubmVsSGFuZGxlcnMoKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIHNjcmVlbiByb2xlIChzY3JlZW4uaHRtbCkgaXMgYSBtYXJxdWVlLW9ubHkgZGlzcGxheTsgc2V0IGl0IHVwXHJcbiAgICAgICAgLy8gYmVmb3JlIHRoZSB3ZWxjb21lIG1lc3NhZ2Ugc28gdGhlIGJvYXJkIGlzIHJlYWR5IGZvciBpdC5cclxuICAgICAgICBpZiAoUkFHLmlzU2NyZWVuUm9sZSgpKVxyXG4gICAgICAgICAgICBSQUcuc2V0dXBEaXNwbGF5Um9sZSgpO1xyXG5cclxuICAgICAgICAvLyBCZWdpbi4gVGhlIGRpc3BsYXkgYm9hcmQgbmVlZHMgbm8gY2xpY2stdGhyb3VnaCwgc28gdGhlIGRpc2NsYWltZXJcclxuICAgICAgICAvLyBpcyBza2lwcGVkIGluIHRoZSBzY3JlZW4gcm9sZS5cclxuICAgICAgICBpZiAoIVJBRy5pc1NjcmVlblJvbGUoKSlcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmRpc2NsYWltZXIuZGlzY2xhaW0oKTtcclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KEwuV0VMQ09NRSk7XHJcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XHJcblxyXG4gICAgICAgIC8vIFBpbmcgZGFzaGJvYXJkIGlmIG9wZW5cclxuICAgICAgICBSQUcuY2hhbm5lbC5zZW5kKCdQT05HJywgeyBzdGF0ZUpzb246IEpTT04uc3RyaW5naWZ5KFJBRy5zdGF0ZSkgfSk7XHJcblxyXG4gICAgICAgIC8vIFRoZSBkYXNoYm9hcmQgcm9sZSAoaW5kZXguaHRtbCkgaXMgdGhlIHRlcm1pbmFsOiBidWlsZCAvIG1hbmFnZSAvXHJcbiAgICAgICAgLy8gcnVuIHNjZW5hcmlvcyBhbmQgZWRpdCBzdGVwcyBpbiBpdHMgaW4tcGFnZSBlZGl0b3IuXHJcbiAgICAgICAgaWYgKFJBRy5pc0Rhc2hib2FyZFJvbGUoKSlcclxuICAgICAgICAgICAgUkFHLmRhc2hib2FyZC5vcGVuKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRydWUgd2hlbiB0aGlzIHBhZ2UgYm9vdGVkIGluIHRoZSBkYXNoYm9hcmQgKHRlcm1pbmFsKSByb2xlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzRGFzaGJvYXJkUm9sZSgpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSQUcuYm9vdFJvbGUgPT09ICdkYXNoYm9hcmQnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBUcnVlIHdoZW4gdGhpcyBwYWdlIGJvb3RlZCBpbiB0aGUgc2NyZWVuIChkaXNwbGF5KSByb2xlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzU2NyZWVuUm9sZSgpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSQUcuYm9vdFJvbGUgPT09ICdzY3JlZW4nO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2NyZWVuIHJvbGU6IHRoaXMgcGFnZSBpcyBhIG1hcnF1ZWUtb25seSBkaXNwbGF5LiBIaWRlIHRoZSB0b29sYmFyIGFuZFxyXG4gICAgICogdGhlIHBocmFzZSBlZGl0b3Igc28gb25seSB0aGUgYm9hcmQgaXMgdmlzaWJsZS4gUGxheWJhY2sgaXMgZHJpdmVuIG92ZXJcclxuICAgICAqIHRoZSBjaGFubmVsIChQTEFZXyogLyBXQUlUX0NPVU5URE9XTiAvIFNUT1BfUExBWUJBQ0spIGFuZCBuZXZlciBzcGVha3NcclxuICAgICAqIGhlcmUsIHNvIHRoZSB2b2ljZSBpcyBub3QgZG91YmxlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgc2V0dXBEaXNwbGF5Um9sZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0b29sYmFyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Rvb2xiYXInKTtcclxuICAgICAgICBpZiAodG9vbGJhcilcclxuICAgICAgICAgICAgdG9vbGJhci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG5cclxuICAgICAgICBsZXQgZWRpdG9yID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VkaXRvcicpO1xyXG4gICAgICAgIGlmIChlZGl0b3IpXHJcbiAgICAgICAgICAgIGVkaXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRWRpdG9yIHJvbGU6IG1pcnJvciBhIHN0ZXAgdGhlIGRhc2hib2FyZCBpcyBydW5uaW5nIGludG8gdGhlIG1hcnF1ZWUuXHJcbiAgICAgKiBEaXNwbGF5LW9ubHkgb24gcHVycG9zZTogdGhlIGRhc2hib2FyZCB0YWIgb3ducyB0aGUgYXVkaW8sIGFuZCBzcGVha2luZ1xyXG4gICAgICogaGVyZSB0b28gd291bGQgZG91YmxlIHRoZSB2b2ljZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWlycm9yU3RlcChtc2c6IGFueSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFSQUcudmlld3MpIHJldHVybjtcclxuICAgICAgICBsZXQgdGV4dCA9IChtc2cgJiYgbXNnLnRleHQpID8gU3RyaW5nKG1zZy50ZXh0KSA6ICcnO1xyXG4gICAgICAgIGlmICh0ZXh0KVxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQodGV4dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZ2lzdGVyIGNoYW5uZWwgaGFuZGxlcnMgZm9yIHRoZSBtYWluIHNjcmVlbiAoaW5kZXguaHRtbCkgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlZ2lzdGVyQ2hhbm5lbEhhbmRsZXJzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNoYW5uZWwub24oJ1BJTkcnLCAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgUkFHLmNoYW5uZWwuc2VuZCgnUE9ORycsIHsgc3RhdGVKc29uOiBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBSQUcuY2hhbm5lbC5vbignTE9BRF9TVEVQJywgKG1zZzogYW55KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKG1zZy5zdGF0ZUpzb24pXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIFJBRy5sb2FkKG1zZy5zdGF0ZUpzb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFRoZSBkYXNoYm9hcmQgdGFiIG93bnMgcGxheWJhY2sgKGF1ZGlvICsgcnVubmVyKTsgdGhlIGVkaXRvciBvbmx5XHJcbiAgICAgICAgLy8gbWlycm9ycyB0aGUgdmlzaWJsZSB0ZXh0LCBzbyB0aGUgdm9pY2UgaXMgbmV2ZXIgZG91YmxlZC5cclxuICAgICAgICBSQUcuY2hhbm5lbC5vbignUExBWV9TSU5HTEVfU1RFUCcsIChtc2c6IGFueSkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy5taXJyb3JTdGVwKG1zZyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIFJBRy5jaGFubmVsLm9uKCdQTEFZX1NDRU5BUklPX1NURVAnLCAobXNnOiBhbnkpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBSQUcubWlycm9yU3RlcChtc2cpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBSQUcuY2hhbm5lbC5vbignV0FJVF9DT1VOVERPV04nLCAobXNnOiBhbnkpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAoIVJBRy52aWV3cykgcmV0dXJuO1xyXG4gICAgICAgICAgICBsZXQgc2VjcyA9IChtc2cgJiYgbXNnLnJlbWFpbmluZ1NlY29uZHMgIT09IHVuZGVmaW5lZCkgPyBtc2cucmVtYWluaW5nU2Vjb25kcyA6IChtc2cgJiYgbXNnLnJlbWFpbmluZyk7XHJcbiAgICAgICAgICAgIGlmIChzZWNzID09PSB1bmRlZmluZWQpIHJldHVybjtcclxuICAgICAgICAgICAgLy8gc2V0U29mdDogc3dhcCB0aGUgdGV4dCBpbiBwbGFjZSBzbyB0aGUgdGlja3MgZG9uJ3QgcmVzdGFydCB0aGUgc2Nyb2xsIGV2ZXJ5IHNlY29uZFxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXRTb2Z0KGBXYWl0aW5nICR7c2Vjc31zLi4uYCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIFJBRy5jaGFubmVsLm9uKCdTVE9QX1BMQVlCQUNLJywgKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChSQUcudmlld3MpXHJcbiAgICAgICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0lkbGUnLCBmYWxzZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIFJBRy5jaGFubmVsLm9uKCdDQVBUVVJFX1NURVBfUkVRVUVTVCcsIChtc2c6IGFueSkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLnNlbmQoJ0NBUFRVUkVEX1NURVBfREFUQScsIHsgbm9uY2U6IG1zZyA/IG1zZy5ub25jZSA6IHVuZGVmaW5lZCwgc3RhdGVKc29uOiBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpIH0pO1xyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0NhcHR1cmVkIHN0ZXAgZm9yIERhc2hib2FyZCBzY2VuYXJpbycpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBOb3RpZnkgZXh0ZXJuYWwgbGlzdGVuZXJzIChkYXNoYm9hcmQpIHRoYXQgdGhlIGN1cnJlbnQgc3RhdGUgaW4gZWRpdG9yIGNoYW5nZWQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbm90aWZ5U3RhdGVDaGFuZ2VkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKFJBRy5jaGFubmVsICYmIFJBRy5zdGF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLnNlbmQoJ1NUQVRFX0NIQU5HRUQnLCB7IHN0YXRlSnNvbjogSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKSB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdlbmVyYXRlcyBhIG5ldyByYW5kb20gcGhyYXNlIGFuZCBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IG5ldyBTdGF0ZSgpO1xyXG4gICAgICAgIFJBRy5zdGF0ZS5nZW5EZWZhdWx0U3RhdGUoKTtcclxuICAgICAgICBpZiAoUkFHLnZpZXdzICYmIFJBRy52aWV3cy5lZGl0b3IpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmdlbmVyYXRlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFJBRy5ub3RpZnlTdGF0ZUNoYW5nZWQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogTG9hZHMgc3RhdGUgZnJvbSBnaXZlbiBKU09OICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWQoanNvbjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBPYmplY3QuYXNzaWduKCBuZXcgU3RhdGUoKSwgSlNPTi5wYXJzZShqc29uKSApIGFzIFN0YXRlO1xyXG4gICAgICAgIGlmIChSQUcudmlld3MgJiYgUkFHLnZpZXdzLmVkaXRvcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuZ2VuZXJhdGUoKTtcclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KEwuU1RBVEVfRlJPTV9TVE9SQUdFKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgUkFHLm5vdGlmeVN0YXRlQ2hhbmdlZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHbG9iYWwgZXJyb3IgaGFuZGxlcjsgdGhyb3dzIHVwIGEgYmlnIHJlZCBwYW5pYyBzY3JlZW4gb24gdW5jYXVnaHQgZXJyb3IgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHBhbmljKGVycm9yOiBzdHJpbmcgfCBFdmVudCA9IFwiVW5rbm93biBlcnJvclwiKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBtc2cgPSAnPGRpdiBpZD1cInBhbmljU2NyZWVuXCIgY2xhc3M9XCJ3YXJuaW5nU2NyZWVuXCI+JyAgICAgICAgICArXHJcbiAgICAgICAgICAgICAgICAgICc8aDE+XCJXZSBhcmUgc29ycnkgdG8gYW5ub3VuY2UgdGhhdC4uLlwiPC9oMT4nICAgICAgICAgICArXHJcbiAgICAgICAgICAgICAgICAgIGA8cD5SQUcgaGFzIGNyYXNoZWQgYmVjYXVzZTogPGNvZGU+JHtlcnJvcn08L2NvZGU+PC9wPmAgK1xyXG4gICAgICAgICAgICAgICAgICBgPHA+UGxlYXNlIG9wZW4gdGhlIGNvbnNvbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24uPC9wPmAgICtcclxuICAgICAgICAgICAgICAgICAgJzwvZGl2Pic7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5uZXJIVE1MID0gbXNnO1xyXG4gICAgfVxyXG59XHJcbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEaXNwb3NhYmxlIGNsYXNzIHRoYXQgaG9sZHMgc3RhdGUgZm9yIHRoZSBjdXJyZW50IHNjaGVkdWxlLCB0cmFpbiwgZXRjLiAqL1xyXG5jbGFzcyBTdGF0ZVxyXG57XHJcbiAgICAvKiogU3RhdGUgb2YgY29sbGFwc2libGUgZWxlbWVudHMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGNvbGxhcHNlZC4gKi9cclxuICAgIHByaXZhdGUgX2NvbGxhcHNpYmxlcyA6IERpY3Rpb25hcnk8Ym9vbGVhbj4gID0ge307XHJcbiAgICAvKiogQ3VycmVudCBjb2FjaCBsZXR0ZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGxldHRlci4gKi9cclxuICAgIHByaXZhdGUgX2NvYWNoZXMgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBpbnRlZ2VyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBpbnRlZ2VyLiAqL1xyXG4gICAgcHJpdmF0ZSBfaW50ZWdlcnMgICAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHBocmFzZXNldCBwaHJhc2UgY2hvaWNlcy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgaW5kZXguICovXHJcbiAgICBwcml2YXRlIF9waHJhc2VzZXRzICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc2VydmljZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc2VydmljZS4gKi9cclxuICAgIHByaXZhdGUgX3NlcnZpY2VzICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzdGF0aW9uIGNvZGUuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9ucyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBsaXN0IGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBhcnJheSBvZiBjb2Rlcy4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25MaXN0cyA6IERpY3Rpb25hcnk8c3RyaW5nW10+ID0ge307XHJcbiAgICAvKiogQ3VycmVudCB0aW1lIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyB0aW1lLiAqL1xyXG4gICAgcHJpdmF0ZSBfdGltZXMgICAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuXHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBleGN1c2UgKi9cclxuICAgIHByaXZhdGUgX2V4Y3VzZT8gICA6IHN0cmluZztcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIHBsYXRmb3JtICovXHJcbiAgICBwcml2YXRlIF9wbGF0Zm9ybT8gOiBQbGF0Zm9ybTtcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIG5hbWVkIHRyYWluICovXHJcbiAgICBwcml2YXRlIF9uYW1lZD8gICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGNvYWNoIGxldHRlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lIGZyb20gQSB0byBaLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgbGV0dGVyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29hY2goY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2FjaGVzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gUmFuZG9tLmFycmF5KEwuTEVUVEVSUyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29hY2ggbGV0dGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29hY2ggVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2FjaChjb250ZXh0OiBzdHJpbmcsIGNvYWNoOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBjb2FjaDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBiZXR3ZWVuIDAgYW5kIDEwMCBvZiBjaG9vc2luZyB0cnVlLCBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBjaGFuY2U6IG51bWJlcikgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSAhUmFuZG9tLmJvb2woY2hhbmNlKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29sbGFwc2libGUncyBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVmFsdWUgdG8gc2V0LCB3aGVyZSB0cnVlIGlzIFwiY29sbGFwc2VkXCJcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvbGxhcHNlZChyZWY6IHN0cmluZywgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gc3RhdGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGludGVnZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5faW50ZWdlcnNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMCwgbWF4ID0gMDtcclxuXHJcbiAgICAgICAgc3dpdGNoKGNvbnRleHQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29hY2hlc1wiOiAgICAgICBtaW4gPSAxOyBtYXggPSAxMDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJkZWxheWVkXCI6ICAgICAgIG1pbiA9IDU7IG1heCA9IDYwOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImZyb250X2NvYWNoZXNcIjogbWluID0gMjsgbWF4ID0gNTsgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicmVhcl9jb2FjaGVzXCI6ICBtaW4gPSAyOyBtYXggPSA1OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYW4gaW50ZWdlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEludGVnZXIoY29udGV4dDogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBwaHJhc2Ugb2YgYSBwaHJhc2VzZXQsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBwaHJhc2VzZXQncyBwaHJhc2Ugb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldElkeChyZWY6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG4gICAgICAgIGxldCBpZHggICAgICAgPSB0aGlzLl9waHJhc2VzZXRzW3JlZl07XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGludHJvZHVjZSBhbiBhc3NlcnRzIHV0aWwsIGFuZCBzdGFydCB1c2luZyB0aGVtIGFsbCBvdmVyXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlNUQVRFX0JBRF9QSFJBU0VTRVQocmVmKSApO1xyXG5cclxuICAgICAgICAvLyBWZXJpZnkgaW5kZXggaXMgdmFsaWQsIGVsc2UgcmVqZWN0IGFuZCBwaWNrIHJhbmRvbVxyXG4gICAgICAgIGlmIChpZHggPT09IHVuZGVmaW5lZCB8fCBwaHJhc2VzZXQuY2hpbGRyZW5baWR4XSA9PT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBSYW5kb20uaW50KDAsIHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGggLSAxKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNob3NlbiBpbmRleCBmb3IgYSBwaHJhc2VzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBwaHJhc2VzZXQgaW5kZXggb2ZcclxuICAgICAqIEBwYXJhbSBpZHggSW5kZXggdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcsIGlkeDogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBpZHg7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHNlcnZpY2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc2VydmljZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU2VydmljZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzZXJ2aWNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzZXJ2aWNlIGZvclxyXG4gICAgICogQHBhcmFtIHNlcnZpY2UgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZywgc2VydmljZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IHNlcnZpY2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHN0YXRpb24gY29kZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzdGF0aW9uIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBmb3JcclxuICAgICAqIEBwYXJhbSBjb2RlIFN0YXRpb24gY29kZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb24oY29udGV4dDogc3RyaW5nLCBjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gY29kZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gbGlzdCBvZiBzdGF0aW9uIGNvZGVzLCBvciByYW5kb21seSBnZW5lcmF0ZXMgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBsaXN0IGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbkxpc3QoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgICAgIGVsc2UgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmcnKTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDEsIG1heCA9IDE2O1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NhbGxpbmdfc3BsaXQnOiBtaW4gPSAyOyBtYXggPSAxNjsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NoYW5nZXMnOiAgICAgICBtaW4gPSAxOyBtYXggPSA0OyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ25vdF9zdG9wcGluZyc6ICBtaW4gPSAxOyBtYXggPSA4OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcyhtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBsaXN0IG9mIHN0YXRpb24gY29kZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBsaXN0IGZvclxyXG4gICAgICogQHBhcmFtIGNvZGVzIFN0YXRpb24gY29kZXMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcsIGNvZGVzOiBzdHJpbmdbXSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdID0gY29kZXM7XHJcblxyXG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnY2FsbGluZ19maXJzdCcpXHJcbiAgICAgICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1snY2FsbGluZyddID0gY29kZXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHRpbWVcclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHRpbWUgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRUaW1lKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fdGltZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IFN0cmluZ3MuZnJvbVRpbWUoIFJhbmRvbS5pbnQoMCwgMjMpLCBSYW5kb20uaW50KDAsIDU5KSApO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl90aW1lc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSB0aW1lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSB0aW1lIGZvclxyXG4gICAgICogQHBhcmFtIHRpbWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRUaW1lKGNvbnRleHQ6IHN0cmluZywgdGltZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IHRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBleGN1c2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBleGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9leGN1c2UpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9leGN1c2U7XHJcblxyXG4gICAgICAgIHRoaXMuX2V4Y3VzZSA9IFJBRy5kYXRhYmFzZS5waWNrRXhjdXNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBzZXQgZXhjdXNlKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBwbGF0Zm9ybSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IHBsYXRmb3JtKCkgOiBQbGF0Zm9ybVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9wbGF0Zm9ybSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXRmb3JtO1xyXG5cclxuICAgICAgICBsZXQgcGxhdGZvcm0gOiBQbGF0Zm9ybSA9IFsnJywgJyddO1xyXG5cclxuICAgICAgICAvLyBPbmx5IDIlIGNoYW5jZSBmb3IgcGxhdGZvcm0gMCwgc2luY2UgaXQncyByYXJlXHJcbiAgICAgICAgcGxhdGZvcm1bMF0gPSBSYW5kb20uYm9vbCg5OClcclxuICAgICAgICAgICAgPyBSYW5kb20uaW50KDEsIDI2KS50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogJzAnO1xyXG5cclxuICAgICAgICAvLyBNYWdpYyB2YWx1ZXNcclxuICAgICAgICBpZiAocGxhdGZvcm1bMF0gPT09ICc5JylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgyNSkgPyAnwr4nIDogJyc7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMTAlIGNoYW5jZSBmb3IgcGxhdGZvcm0gbGV0dGVyLCBzaW5jZSBpdCdzIHVuY29tbW9uXHJcbiAgICAgICAgaWYgKHBsYXRmb3JtWzFdID09PSAnJylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgxMClcclxuICAgICAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCdBQkMnKVxyXG4gICAgICAgICAgICAgICAgOiAnJztcclxuXHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSBwbGF0Zm9ybTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzZXQgcGxhdGZvcm0odmFsdWU6IFBsYXRmb3JtKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBuYW1lZCB0cmFpbiwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IG5hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fbmFtZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuXHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSBSQUcuZGF0YWJhc2UucGlja05hbWVkKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc2V0IG5hbWVkKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgdGhlIHN0YXRlIGluIGEgcGFydGljdWxhciB3YXksIHNvIHRoYXQgaXQgbWFrZXMgc29tZSByZWFsLXdvcmxkIHNlbnNlLlxyXG4gICAgICogVG8gZG8gc28sIHdlIGhhdmUgdG8gZ2VuZXJhdGUgZGF0YSBpbiBhIHBhcnRpY3VsYXIgb3JkZXIsIGFuZCBtYWtlIHN1cmUgdG8gYXZvaWRcclxuICAgICAqIGR1cGxpY2F0ZXMgaW4gaW5hcHByb3ByaWF0ZSBwbGFjZXMgYW5kIGNvbnRleHRzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2VuRGVmYXVsdFN0YXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RlcCAxLiBQcmVwb3B1bGF0ZSBzdGF0aW9uIGxpc3RzXHJcblxyXG4gICAgICAgIGxldCBzbENhbGxpbmcgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDE2KTtcclxuICAgICAgICBsZXQgc2xDYWxsU3BsaXQgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygyLCAxNiwgc2xDYWxsaW5nKTtcclxuICAgICAgICBsZXQgYWxsQ2FsbGluZyAgPSBbLi4uc2xDYWxsaW5nLCAuLi5zbENhbGxTcGxpdF07XHJcblxyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgZm91bmQgdmlhIGEgc3BlY2lmaWMgY2FsbGluZyBwb2ludFxyXG4gICAgICAgIGxldCBzbENoYW5nZXMgICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgNCwgYWxsQ2FsbGluZyk7XHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyB0aGF0IHRoaXMgdHJhaW4gdXN1YWxseSBzZXJ2ZXMsIGJ1dCBjdXJyZW50bHkgaXNuJ3RcclxuICAgICAgICBsZXQgc2xOb3RTdG9wcGluZyA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDgsXHJcbiAgICAgICAgICAgIFsuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXNdXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGFrZSBhIHJhbmRvbSBzbGljZSBmcm9tIHRoZSBjYWxsaW5nIGxpc3QsIHRvIGlkZW50aWZ5IGFzIHJlcXVlc3Qgc3RvcHNcclxuICAgICAgICBsZXQgcmVxQ291bnQgICA9IFJhbmRvbS5pbnQoMSwgc2xDYWxsaW5nLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGxldCBzbFJlcXVlc3RzID0gc2xDYWxsaW5nLnNsaWNlKDAsIHJlcUNvdW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZycsICAgICAgIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZ19zcGxpdCcsIHNsQ2FsbFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjaGFuZ2VzJywgICAgICAgc2xDaGFuZ2VzKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdub3Rfc3RvcHBpbmcnLCAgc2xOb3RTdG9wcGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgncmVxdWVzdCcsICAgICAgIHNsUmVxdWVzdHMpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDIuIFByZXBvcHVsYXRlIHN0YXRpb25zXHJcblxyXG4gICAgICAgIC8vIEFueSBzdGF0aW9uIG1heSBiZSBibGFtZWQgZm9yIGFuIGV4Y3VzZSwgZXZlbiBvbmVzIGFscmVhZHkgcGlja2VkXHJcbiAgICAgICAgbGV0IHN0RXhjdXNlICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiBpcyBmaW5hbCBjYWxsIG9mIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0ICAgID0gc2xDYWxsaW5nW3NsQ2FsbGluZy5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBWaWEgaXMgYSBjYWxsIGJlZm9yZSB0aGUgZGVzdGluYXRpb24sIG9yIG9uZSBpbiB0aGUgc3BsaXQgbGlzdCBpZiB0b28gc21hbGxcclxuICAgICAgICBsZXQgc3RWaWEgICAgID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBEaXR0byBmb3IgcGlja2luZyBhIHJhbmRvbSBjYWxsaW5nIHN0YXRpb24gYXMgYSBzaW5nbGUgcmVxdWVzdCBvciBjaGFuZ2Ugc3RvcFxyXG4gICAgICAgIGxldCBzdENhbGxpbmcgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG5cclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiAobGFzdCBjYWxsKSBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3RTcGxpdCA9IHNsQ2FsbFNwbGl0W3NsQ2FsbFNwbGl0Lmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFJhbmRvbSBub24tZGVzdGluYXRpb24gc3RvcCBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdFZpYVNwbGl0ICA9IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gV2hlcmUgdGhlIHRyYWluIGNvbWVzIGZyb20sIHNvIGNhbid0IGJlIG9uIGFueSBsaXN0cyBvciBwcmlvciBzdGF0aW9uc1xyXG4gICAgICAgIGxldCBzdFNvdXJjZSAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoW1xyXG4gICAgICAgICAgICAuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXMsIC4uLnNsTm90U3RvcHBpbmcsIC4uLnNsUmVxdWVzdHMsXHJcbiAgICAgICAgICAgIHN0Q2FsbGluZywgc3REZXN0LCBzdFZpYSwgc3REZXN0U3BsaXQsIHN0VmlhU3BsaXRcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdjYWxsaW5nJywgICAgICAgICAgIHN0Q2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbicsICAgICAgIHN0RGVzdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbl9zcGxpdCcsIHN0RGVzdFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2V4Y3VzZScsICAgICAgICAgICAgc3RFeGN1c2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignc291cmNlJywgICAgICAgICAgICBzdFNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWEnLCAgICAgICAgICAgICAgIHN0VmlhKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYV9zcGxpdCcsICAgICAgICAgc3RWaWFTcGxpdCk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMy4gUHJlcG9wdWxhdGUgY29hY2ggbnVtYmVyc1xyXG5cclxuICAgICAgICBsZXQgaW50Q29hY2hlcyA9IHRoaXMuZ2V0SW50ZWdlcignY29hY2hlcycpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGp1c3Qgc3BsaXQgdGhlIG51bWJlciBkb3duIHRoZSBtaWRkbGUgaW5zdGVhZC5cclxuICAgICAgICAvLyBFbHNlLCBmcm9udCBhbmQgcmVhciBjb2FjaGVzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGludEZyb250Q29hY2hlcyA9IChpbnRDb2FjaGVzIC8gMikgfCAwO1xyXG4gICAgICAgICAgICBsZXQgaW50UmVhckNvYWNoZXMgID0gaW50Q29hY2hlcyAtIGludEZyb250Q29hY2hlcztcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcignZnJvbnRfY29hY2hlcycsIGludEZyb250Q29hY2hlcyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcigncmVhcl9jb2FjaGVzJywgaW50UmVhckNvYWNoZXMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBhc3NpZ24gY29hY2ggbGV0dGVycyBmb3IgY29udGV4dHMuXHJcbiAgICAgICAgLy8gRWxzZSwgbGV0dGVycyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsZXR0ZXJzID0gTC5MRVRURVJTLnNsaWNlKDAsIGludENvYWNoZXMpLnNwbGl0KCcnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdmaXJzdCcsICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3Nob3AnLCAgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQxJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDInLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNC4gUHJlcG9wdWxhdGUgc2VydmljZXNcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBzZXJ2aWNlLCBwaWNrIG9uZSB0byBiZSB0aGUgXCJtYWluXCIgYW5kIG9uZSB0byBiZSB0aGVcclxuICAgICAgICAvLyBcImFsdGVybmF0ZVwiLCBlbHNlIHRoZSBvbmUgc2VydmljZSB3aWxsIGJlIHVzZWQgZm9yIGJvdGggKHdpdGhvdXQgbWFraW5nIHNlbnNlKS5cclxuICAgICAgICBpZiAoUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmxlbmd0aCA+IDEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgc2VydmljZXMgPSBSQUcuZGF0YWJhc2Uuc2VydmljZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ3Byb3ZpZGVyJywgICAgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdhbHRlcm5hdGl2ZScsIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNS4gUHJlcG9wdWxhdGUgdGltZXNcclxuICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTIxNDc1M1xyXG5cclxuICAgICAgICAvLyBUaGUgYWx0ZXJuYXRpdmUgdGltZSBpcyBmb3IgYSB0cmFpbiB0aGF0J3MgbGF0ZXIgdGhhbiB0aGUgbWFpbiB0cmFpblxyXG4gICAgICAgIGxldCB0aW1lICAgID0gbmV3IERhdGUoIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgUmFuZG9tLmludCgwLCA1OSkgKiA2MDAwMCk7XHJcbiAgICAgICAgbGV0IHRpbWVBbHQgPSBuZXcgRGF0ZSggdGltZS5nZXRUaW1lKCkgICAgICAgKyBSYW5kb20uaW50KDAsIDMwKSAqIDYwMDAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnbWFpbicsICAgICAgICBTdHJpbmdzLmZyb21UaW1lKHRpbWUpICAgICk7XHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnYWx0ZXJuYXRpdmUnLCBTdHJpbmdzLmZyb21UaW1lKHRpbWVBbHQpICk7XHJcbiAgICB9XHJcbn0iXX0=