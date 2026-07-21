"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];
        RAG.views.editor.setElementsText('platform', RAG.state.platform.join(''));
    }
    /** Hides and clears the letter selector if platform number is > 26 */
    updateLetterVisibility() {
        let intVal = parseInt(this.inputDigit.value);
        let hide = isNaN(intVal) || intVal > 26;
        this.inputLetter.hidden = hide;
        if (hide) {
            this.inputLetter.value = '';
        }
    }
    onClick(_) { }
    onInput(_) { }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
        this.STATE_TO_STORAGE = 'State has been saved to storage, and dumped to console.';
        this.STATE_COPY_PASTE = '%cCopy and paste this in console to load later:';
        this.STATE_RAW_JSON = '%cRaw JSON state:';
        this.STATE_SAVE_MISSING = 'Sorry, no state was found in storage.';
        this.STATE_SAVE_FAIL = (msg) => `Sorry, state could not be saved to storage: ${msg}`;
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
        this.TOOLBAR_SAVE = 'Save state to storage';
        this.TOOLBAR_LOAD = 'Recall state from storage';
        this.TOOLBAR_SETTINGS = 'Open settings';
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
        ctx.newElement.textContent = RAG.state.platform.join('');
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
    /** Persists the dismissal to storage and restores the main screen */
    onDismiss() {
        RAG.config.readDisclaimer = true;
        this.dom.hidden = true;
        RAG.views.main.hidden = false;
        this.btnDismiss.onclick = null;
        RAG.config.save();
        if (this.lastActive) {
            this.lastActive.focus();
            this.lastActive = undefined;
        }
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
    /** Stops the current marquee animation */
    stop() {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.style.transform = '';
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
        RAG.views.main.hidden = true;
        this.btnSave.focus();
    }
    /** Closes the settings screen */
    close() {
        this.cancelReset();
        RAG.speech.stop();
        RAG.views.main.hidden = false;
        this.dom.hidden = true;
        RAG.views.toolbar.btnOption.focus();
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="viewBase.ts"/>
/** Controller for the state save/load picker dialog */
class StatePicker extends ViewBase {
    constructor() {
        super('#statePicker');
        this.mode = 'save';
        this.states = {};
        this.inputNumber = this.attach('#statePickerValue');
        this.inputName = this.attach('#statePickerName');
        this.domPreview = this.attach('#statePickerPreview');
        this.pWarning = this.attach('#statePickerWarning');
        this.btnAction = this.attach('#btnStateAction');
        this.btnDelete = this.attach('#btnStateDelete');
        this.btnCancel = this.attach('#btnStateCancel');
        this.domList = this.attach('#statePickerList');
        this.btnAction.onclick = this.handleAction.bind(this);
        this.btnDelete.onclick = this.handleDelete.bind(this);
        this.btnCancel.onclick = this.close.bind(this);
        this.inputNumber.oninput = this.handleInput.bind(this);
        this.inputName.oninput = this.handleNameInput.bind(this);
        // Load initial states from localStorage
        this.loadStates();
    }
    loadStates() {
        let raw = window.localStorage.getItem('states');
        if (raw) {
            try {
                let parsed = JSON.parse(raw);
                this.states = {};
                for (let key in parsed) {
                    let val = parsed[key];
                    if (typeof val === 'string') {
                        this.states[parseInt(key)] = { name: `State ${key}`, data: val };
                    }
                    else {
                        this.states[parseInt(key)] = val;
                    }
                }
            }
            catch (e) {
                this.states = {};
            }
        }
        else {
            this.states = {};
        }
    }
    saveStates() {
        window.localStorage.setItem('states', JSON.stringify(this.states));
    }
    open(mode) {
        this.loadStates();
        this.mode = mode;
        this.inputNumber.value = '';
        this.inputName.value = '';
        this.domPreview.innerText = '';
        this.pWarning.hidden = true;
        if (this.mode === 'save') {
            this.btnAction.innerText = 'Save';
            this.btnAction.disabled = true; // Wait for valid input
        }
        else {
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
    refreshList() {
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
    close(ev) {
        if (ev)
            ev.preventDefault();
        this.dom.hidden = true;
        RAG.views.main.style.pointerEvents = '';
        if (this.mode === 'save') {
            RAG.views.toolbar.btnSave.focus();
        }
        else {
            RAG.views.toolbar.btnRecall.focus();
        }
    }
    layout() {
        let docW = document.body.clientWidth;
        let docH = document.body.clientHeight;
        let dialogX = DOM.isMobile ? 0 : ((docW * 0.1) / 2) | 0;
        let dialogY = DOM.isMobile ? 0 : ((docH * 0.1) / 2) | 0;
        if (DOM.isMobile) {
            this.dom.style.width = `100%`;
        }
        this.dom.style.left = dialogX + 'px';
        this.dom.style.top = dialogY + 'px';
        this.dom.style.zIndex = '9999';
    }
    handleNameInput() {
        // Just trigger input handler if in save mode, as name affects nothing in load
    }
    handleInput() {
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
        }
        else {
            this.domPreview.innerText = '';
        }
        if (this.mode === 'save') {
            this.btnAction.disabled = false;
            this.pWarning.hidden = !exists;
            if (exists) {
                this.pWarning.innerText = 'Warning: State already exists and will be overwritten!';
                this.pWarning.style.color = '#ffaa00';
            }
        }
        else {
            // Load mode
            this.btnAction.disabled = !exists;
            this.pWarning.hidden = exists; // If doesn't exist, show warning
            if (!exists) {
                this.pWarning.innerText = 'State does not exist.';
                this.pWarning.style.color = '#ff5555';
            }
        }
    }
    previewStateText(stateJson) {
        try {
            let oldState = RAG.state;
            RAG.state = Object.assign(new State(), JSON.parse(stateJson));
            let tempDom = document.createElement('div');
            tempDom.innerHTML = '<phraseset ref="root" />';
            RAG.phraser.process(tempDom);
            let compiledText = DOM.getCleanedVisibleText(tempDom);
            RAG.state = oldState;
            return compiledText;
        }
        catch (e) {
            return "Error compiling preview: " + e.message;
        }
    }
    handleAction(ev) {
        ev.preventDefault();
        let val = parseInt(this.inputNumber.value);
        if (isNaN(val) || val < 1)
            return;
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
            }
            catch (e) {
                RAG.views.marquee.set(L.STATE_SAVE_FAIL(e.message));
            }
        }
        else {
            let stateObj = this.states[val];
            if (stateObj && stateObj.data) {
                RAG.load(stateObj.data);
                this.close();
            }
        }
    }
    handleDelete(ev) {
        ev.preventDefault();
        let val = parseInt(this.inputNumber.value);
        if (isNaN(val) || val < 1)
            return;
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the top toolbar */
class Toolbar {
    constructor() {
        this.dom = DOM.require('#toolbar');
        this.btnPlay = DOM.require('#btnPlay');
        this.btnStop = DOM.require('#btnStop');
        this.btnGenerate = DOM.require('#btnShuffle');
        this.btnSave = DOM.require('#btnSave');
        this.btnRecall = DOM.require('#btnLoad');
        this.btnOption = DOM.require('#btnSettings');
        this.btnPlay.onclick = this.handlePlay.bind(this);
        this.btnStop.onclick = this.handleStop.bind(this);
        this.btnGenerate.onclick = this.handleGenerate.bind(this);
        this.btnSave.onclick = this.handleSave.bind(this);
        this.btnRecall.onclick = this.handleLoad.bind(this);
        this.btnOption.onclick = this.handleOption.bind(this);
        // Add throb class if the generate button hasn't been clicked before
        if (!RAG.config.clickedGenerate) {
            this.btnGenerate.classList.add('throb');
            this.btnGenerate.focus();
        }
        else
            this.btnPlay.focus();
    }
    /** Handles the play button, playing the editor's current phrase with speech */
    handlePlay() {
        RAG.speech.stop();
        this.btnPlay.disabled = true;
        // Has to execute on a delay, otherwise native speech cancel becomes unreliable
        window.setTimeout(this.handlePlay2.bind(this), 200);
    }
    /** Continuation of handlePlay, executed after a delay */
    handlePlay2() {
        let hasSpoken = false;
        let speechText = RAG.views.editor.getText();
        this.btnPlay.hidden = true;
        this.btnPlay.disabled = false;
        this.btnStop.hidden = false;
        // TODO: Localize
        RAG.views.marquee.set('Loading VOX...', false);
        // If speech takes too long (10 seconds) to load, cancel it
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
            // Check if anything was actually spoken. If not, something went wrong.
            if (!hasSpoken && RAG.config.voxEnabled) {
                RAG.config.voxEnabled = false;
                // TODO: Localize
                alert('It appears that the VOX engine was unable to say anything.' +
                    ' Either the current voice path is unreachable, or the engine' +
                    ' crashed. Please check the console. The VOX engine has been' +
                    ' disabled and native text-to-speech will be used on next play.');
            }
            else if (!hasSpoken)
                alert('It appears that the browser was unable to say anything.' +
                    ' Either the current voice failed to load, or this browser does' +
                    ' not support support text-to-speech. Please check the console.');
            // Since the marquee would have been stuck on "Loading...", scroll it
            if (!hasSpoken)
                RAG.views.marquee.set(speechText);
        };
        RAG.speech.speak(RAG.views.editor.getPhrase());
        this.btnStop.focus();
    }
    /** Handles the stop button, stopping the marquee and any speech */
    handleStop(ev) {
        RAG.speech.onspeak = undefined;
        RAG.speech.onstop = undefined;
        this.btnPlay.hidden = false;
        // Only focus play button if user didn't move focus elsewhere. Prevents
        // annoying surprise of focus suddenly shifting away.
        if (document.activeElement === this.btnStop)
            this.btnPlay.focus();
        this.btnStop.hidden = true;
        RAG.speech.stop();
        // If event exists, this stop was called by the user
        if (ev)
            RAG.views.marquee.set(RAG.views.editor.getText(), false);
    }
    /** Handles the generate button, generating new random state and phrase */
    handleGenerate() {
        // Remove the call-to-action throb from initial load
        this.btnGenerate.classList.remove('throb');
        RAG.generate();
        RAG.config.clickedGenerate = true;
    }
    /** Handles the save button, opening the state picker in save mode */
    handleSave() {
        RAG.views.statePicker.open('save');
    }
    /** Handles the load button, opening the state picker in load mode */
    handleLoad() {
        RAG.views.statePicker.open('load');
    }
    /** Handles the settings button, opening the settings screen */
    handleOption() {
        RAG.views.settings.open();
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages UI elements and their logic */
class Views {
    constructor() {
        this.main = DOM.require('#mainScreen');
        this.disclaimer = new Disclaimer();
        this.editor = new Editor();
        this.marquee = new Marquee();
        this.settings = new Settings();
        this.statePicker = new StatePicker();
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
    /** Handle ESC to close pickers or settigns */
    onInput(ev) {
        if (ev.key !== 'Escape')
            return;
        this.editor.closeDialog();
        this.settings.close();
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Sugar for choosing second value if first is undefined, instead of falsy */
function either(value, value2) {
    return (value === undefined || value === null) ? value2 : value;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
        I18n.init();
        RAG.config = new Config(true);
        RAG.database = new Database(dataRefs);
        RAG.views = new Views();
        RAG.phraser = new Phraser();
        RAG.speech = new Speech();
        // Begin
        RAG.views.disclaimer.disclaim();
        RAG.views.marquee.set(L.WELCOME);
        RAG.generate();
    }
    /** Generates a new random phrase and state */
    static generate() {
        RAG.state = new State();
        RAG.state.genDefaultState();
        RAG.views.editor.generate();
    }
    /** Loads state from given JSON */
    static load(json) {
        RAG.state = Object.assign(new State(), JSON.parse(json));
        RAG.views.editor.generate();
        RAG.views.marquee.set(L.STATE_FROM_STORAGE);
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL2NvbGxhcHNlVG9nZ2xlLnRzIiwidWkvY29udHJvbHMvcGhyYXNlc2V0QnV0dG9uLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkNob29zZXIudHMiLCJ1aS9jb250cm9scy9zdGF0aW9uTGlzdEl0ZW0udHMiLCJ1aS9waWNrZXJzL3BpY2tlci50cyIsInVpL3BpY2tlcnMvY29hY2hQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2V4Y3VzZVBpY2tlci50cyIsInVpL3BpY2tlcnMvaW50ZWdlclBpY2tlci50cyIsInVpL3BpY2tlcnMvbmFtZWRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BocmFzZXNldFBpY2tlci50cyIsInVpL3BpY2tlcnMvcGxhdGZvcm1QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3NlcnZpY2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25MaXN0UGlja2VyLnRzIiwidWkvcGlja2Vycy90aW1lUGlja2VyLnRzIiwiY29uZmlnL2NvbmZpZ0Jhc2UudHMiLCJjb25maWcvY29uZmlnLnRzIiwibGFuZy9lbmdsaXNoTGFuZ3VhZ2UudHMiLCJwaHJhc2VyL2VsZW1lbnRQcm9jZXNzb3JzLnRzIiwicGhyYXNlci9waHJhc2VDb250ZXh0LnRzIiwicGhyYXNlci9waHJhc2VyLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL3ZpZXdCYXNlLnRzIiwidWkvZGlzY2xhaW1lci50cyIsInVpL2VkaXRvci50cyIsInVpL21hcnF1ZWUudHMiLCJ1aS9zZXR0aW5ncy50cyIsInVpL3N0YXRlUGlja2VyLnRzIiwidWkvdG9vbGJhci50cyIsInVpL3ZpZXdzLnRzIiwidXRpbC9hc3NlcnRzLnRzIiwidXRpbC9jb2xsYXBzaWJsZXMudHMiLCJ1dGlsL2NvbmRpdGlvbmFscy50cyIsInV0aWwvZG9tLnRzIiwidXRpbC9saW5rZG93bi50cyIsInV0aWwvcGFyc2UudHMiLCJ1dGlsL3JhbmRvbS50cyIsInV0aWwvc291bmRzLnRzIiwidXRpbC9zdHJpbmdzLnRzIiwidXRpbC90eXBlcy50cyIsImRhdGFiYXNlLnRzIiwicmFnLnRzIiwic3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEscUVBQXFFO0FBRXJFLDhEQUE4RDtBQUM5RCxJQUFJLENBQW1CLENBQUM7QUFFeEIsTUFBTSxJQUFJO0lBVU4sNEVBQTRFO0lBQ3JFLE1BQU0sQ0FBQyxJQUFJO1FBRWQsSUFBSSxJQUFJLENBQUMsU0FBUztZQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsU0FBUyxHQUFHO1lBQ2IsSUFBSSxFQUFHLElBQUksZUFBZSxFQUFFO1NBQy9CLENBQUM7UUFFRiwyQkFBMkI7UUFDM0IsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxNQUFNLENBQUMsVUFBVTtRQUVyQixJQUFJLElBQWtCLENBQUM7UUFDdkIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUNoQyxRQUFRLENBQUMsSUFBSSxFQUNiLFVBQVUsQ0FBQyxZQUFZLEdBQUcsVUFBVSxDQUFDLFNBQVMsRUFDOUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUMvQixLQUFLLENBQ1IsQ0FBQztRQUVGLE9BQVEsSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFDOUI7WUFDSSxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssSUFBSSxDQUFDLFlBQVksRUFDdkM7Z0JBQ0ksSUFBSSxPQUFPLEdBQUcsSUFBZSxDQUFDO2dCQUU5QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFO29CQUM5QyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNuRDtpQkFDSSxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsV0FBVztnQkFDekQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUNqQztJQUNMLENBQUM7SUFFRCwrREFBK0Q7SUFDdkQsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFVO1FBRWhDLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsWUFBWSxDQUFDO1lBQzNDLENBQUMsQ0FBRSxJQUFnQixDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUU7WUFDekMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFjLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBRWhELE9BQU8sQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztZQUNwQyxDQUFDLENBQUMsVUFBVSxDQUFDLGFBQWE7WUFDMUIsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUM7SUFDbkMsQ0FBQztJQUVELDBEQUEwRDtJQUNsRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQVU7UUFFckMsNkVBQTZFO1FBQzdFLGdGQUFnRjtRQUNoRiw0Q0FBNEM7UUFFNUMsSUFBSyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVELDBEQUEwRDtJQUNsRCxNQUFNLENBQUMsY0FBYyxDQUFDLElBQVU7UUFFcEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMvRSxDQUFDO0lBRUQsK0RBQStEO0lBQ3ZELE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBYTtRQUVoQyxJQUFJLEdBQUcsR0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9CLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQWtCLENBQUM7UUFFcEMsSUFBSSxDQUFDLEtBQUssRUFDVjtZQUNJLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDakQsT0FBTyxLQUFLLENBQUM7U0FDaEI7O1lBQ0ksT0FBTyxDQUFDLE9BQU8sS0FBSyxLQUFLLFVBQVUsQ0FBQztnQkFDckMsQ0FBQyxDQUFDLEtBQUssRUFBRTtnQkFDVCxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQ2hCLENBQUM7O0FBaEdELG1EQUFtRDtBQUMzQixjQUFTLEdBQVksV0FBVyxDQUFDO0FDUjdELHFFQUFxRTtBQUtyRSwwRUFBMEU7QUFDMUUsTUFBTSxPQUFPO0lBa0NULHdFQUF3RTtJQUN4RSxZQUFtQixNQUFtQjtRQVp0QyxxREFBcUQ7UUFDM0Msa0JBQWEsR0FBYSxJQUFJLENBQUM7UUFHekMsbURBQW1EO1FBQ3pDLGtCQUFhLEdBQVksQ0FBQyxDQUFDO1FBQ3JDLCtEQUErRDtRQUNyRCxlQUFVLEdBQWdCLEtBQUssQ0FBQztRQUMxQyxtREFBbUQ7UUFDekMsY0FBUyxHQUFnQiwyQkFBMkIsQ0FBQztRQUszRCxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVE7WUFDakIsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRW5CLElBQUksTUFBTSxHQUFRLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2pELElBQUksV0FBVyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDckUsSUFBSSxLQUFLLEdBQVMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsU0FBUyxHQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRXBELElBQUksQ0FBQyxHQUFHLEdBQVksT0FBTyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFnQixDQUFDO1FBQ3BFLElBQUksQ0FBQyxXQUFXLEdBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzNELElBQUksQ0FBQyxZQUFZLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRTNELElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxHQUFRLEtBQUssQ0FBQztRQUNyQyxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFDM0MseURBQXlEO1FBQ3pELG9EQUFvRDtRQUNwRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssR0FBUyxXQUFXLENBQUM7UUFFM0MsTUFBTSxDQUFDLHFCQUFxQixDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3BCLENBQUM7SUFyREQsd0RBQXdEO0lBQ2hELE1BQU0sQ0FBQyxJQUFJO1FBRWYsT0FBTyxDQUFDLFFBQVEsR0FBVSxHQUFHLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDMUQsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQU8sRUFBRSxDQUFDO1FBQzdCLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNoQyxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQzlCLENBQUM7SUFnREQ7Ozs7O09BS0c7SUFDSSxHQUFHLENBQUMsS0FBYSxFQUFFLFNBQWtCLEtBQUs7UUFFN0MsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV4QyxJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUV2QixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSSxNQUFNLENBQUMsSUFBaUIsRUFBRSxTQUFrQixLQUFLO1FBRXBELElBQUksQ0FBQyxLQUFLLEdBQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUMvQixJQUFJLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRW5CLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXBDLElBQUksTUFBTSxFQUNWO1lBQ0ksSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN4QixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDaEI7SUFDTCxDQUFDO0lBRUQsZ0VBQWdFO0lBQ3pELEtBQUs7UUFFUixJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQVEsRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCw4REFBOEQ7SUFDdkQsU0FBUyxDQUFDLEtBQWE7UUFFMUIsS0FBSyxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFDMUM7WUFDSSxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQWdCLENBQUM7WUFFMUQsSUFBSSxLQUFLLEtBQUssSUFBSSxDQUFDLFNBQVMsRUFDNUI7Z0JBQ0ksSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDeEIsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNiLE1BQU07YUFDVDtTQUNKO0lBQ0wsQ0FBQztJQUVELHdEQUF3RDtJQUNqRCxPQUFPLENBQUMsRUFBYztRQUV6QixJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUMsTUFBcUIsQ0FBQztRQUV0QyxJQUFLLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQzFCLElBQUssQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQztnQkFDakMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRUQsOERBQThEO0lBQ3ZELE9BQU87UUFFVixNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsa0VBQWtFO0lBQzNELE9BQU8sQ0FBQyxFQUFpQjtRQUU1QixJQUFJLEdBQUcsR0FBTyxFQUFFLENBQUMsR0FBRyxDQUFDO1FBQ3JCLElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUE0QixDQUFDO1FBQ3BELElBQUksTUFBTSxHQUFJLE9BQU8sQ0FBQyxhQUFjLENBQUM7UUFFckMsSUFBSSxDQUFDLE9BQU87WUFBRSxPQUFPO1FBRXJCLGdEQUFnRDtRQUNoRCxJQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7WUFDcEIsT0FBTztRQUVYLGdDQUFnQztRQUNoQyxJQUFJLE9BQU8sS0FBSyxJQUFJLENBQUMsV0FBVyxFQUNoQztZQUNJLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRXhDLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNoRSxPQUFPO1NBQ1Y7UUFFRCxzQ0FBc0M7UUFDdEMsSUFBSSxPQUFPLEtBQUssSUFBSSxDQUFDLFdBQVc7WUFDaEMsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxHQUFHLEtBQUssV0FBVztnQkFDdkMsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRXBDLDZEQUE2RDtRQUM3RCxJQUFLLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO1lBQzNCLElBQUksR0FBRyxLQUFLLE9BQU87Z0JBQ2YsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRWhDLHNEQUFzRDtRQUN0RCxJQUFJLEdBQUcsS0FBSyxXQUFXLElBQUksR0FBRyxLQUFLLFlBQVksRUFDL0M7WUFDSSxJQUFJLEdBQUcsR0FBRyxDQUFDLEdBQUcsS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QyxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUM7WUFFZixrRUFBa0U7WUFDbEUsSUFBVSxJQUFJLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDO2dCQUNyRCxHQUFHLEdBQUcsR0FBRyxDQUFDLHVCQUF1QixDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQztZQUVwRCxzRUFBc0U7aUJBQ2pFLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLE9BQU8sQ0FBQyxhQUFhLEtBQUssSUFBSSxDQUFDLFlBQVk7Z0JBQ3BFLEdBQUcsR0FBRyxHQUFHLENBQUMsdUJBQXVCLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRXBELGtEQUFrRDtpQkFDN0MsSUFBSSxPQUFPLEtBQUssSUFBSSxDQUFDLFdBQVc7Z0JBQ2pDLEdBQUcsR0FBRyxHQUFHLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUU3RCxxREFBcUQ7aUJBQ2hELElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQztnQkFDZixHQUFHLEdBQUcsR0FBRyxDQUFDLHVCQUF1QixDQUM3QixPQUFPLENBQUMsaUJBQWlDLEVBQUUsR0FBRyxDQUNqRCxDQUFDOztnQkFFRixHQUFHLEdBQUcsR0FBRyxDQUFDLHVCQUF1QixDQUM3QixPQUFPLENBQUMsZ0JBQWdDLEVBQUUsR0FBRyxDQUNoRCxDQUFDO1lBRU4sSUFBSSxHQUFHO2dCQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUN4QjtJQUNMLENBQUM7SUFFRCw0REFBNEQ7SUFDckQsUUFBUSxDQUFDLEVBQVM7UUFFckIsRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3BCLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNsQixDQUFDO0lBRUQsa0VBQWtFO0lBQ3hELE1BQU07UUFFWixNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUV4QyxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNsRCxJQUFJLEtBQUssR0FBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQztRQUN4QyxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVTtZQUN4QixDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDckIsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUM7UUFFekIsaURBQWlEO1FBQ2pELGdFQUFnRTtRQUNoRSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFFaEMsZ0NBQWdDO1FBQ2hDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRTtZQUNqQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBZ0IsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7SUFDckMsQ0FBQztJQUVELHNFQUFzRTtJQUM1RCxNQUFNLENBQUMsVUFBVSxDQUFDLElBQWlCLEVBQUUsTUFBYztRQUV6RCwrQkFBK0I7UUFDL0IsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQ3JEO1lBQ0ksSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7WUFDcEIsT0FBTyxDQUFDLENBQUM7U0FDWjtRQUVELGNBQWM7YUFFZDtZQUNJLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1lBQ25CLE9BQU8sQ0FBQyxDQUFDO1NBQ1o7SUFDTCxDQUFDO0lBRUQsbUZBQW1GO0lBQ3pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBa0IsRUFBRSxNQUFjO1FBRTNELElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFDN0IsSUFBSSxLQUFLLEdBQUssT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyx3QkFBd0I7UUFDMUQsSUFBSSxNQUFNLEdBQUksQ0FBQyxDQUFDO1FBRWhCLDRFQUE0RTtRQUM1RSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUU7WUFDbkMsTUFBTSxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBZ0IsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVwRSw0RUFBNEU7UUFDNUUsSUFBSSxNQUFNLElBQUksS0FBSztZQUNmLEtBQUssQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDOztZQUVwQixLQUFLLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztJQUM3QixDQUFDO0lBRUQsK0VBQStFO0lBQ3JFLE1BQU0sQ0FBQyxLQUFrQjtRQUUvQixJQUFJLGVBQWUsR0FBRyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFbkQsSUFBSSxJQUFJLENBQUMsYUFBYTtZQUNsQixJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTdCLElBQUksSUFBSSxDQUFDLFFBQVE7WUFDYixJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXpCLElBQUksZUFBZTtZQUNmLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxzREFBc0Q7SUFDNUMsWUFBWSxDQUFDLEtBQWtCO1FBRXJDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUV0QixJQUFJLENBQUMsV0FBVyxHQUFZLEtBQUssQ0FBQztRQUNsQyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDL0IsS0FBSyxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVELGdFQUFnRTtJQUN0RCxjQUFjO1FBRXBCLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVztZQUNqQixPQUFPO1FBRVgsSUFBSSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0IsSUFBSSxDQUFDLFdBQVcsR0FBWSxTQUFTLENBQUM7SUFDMUMsQ0FBQztJQUVEOzs7O09BSUc7SUFDTyxJQUFJLENBQUMsTUFBbUI7UUFFOUIsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRUQseUVBQXlFO0lBQy9ELFFBQVEsQ0FBQyxNQUFvQjtRQUVuQyxPQUFPLE1BQU0sS0FBSyxTQUFTO2VBQ3BCLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLEtBQUssSUFBSTtlQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzdCLENBQUM7Q0FDSjtBQ2xVRCxxRUFBcUU7QUFFckUsdUVBQXVFO0FBQ3ZFLE1BQU0sY0FBYztJQUtoQix3REFBd0Q7SUFDaEQsTUFBTSxDQUFDLElBQUk7UUFFZixjQUFjLENBQUMsUUFBUSxHQUFVLEdBQUcsQ0FBQyxPQUFPLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUMzRSxjQUFjLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBTyxFQUFFLENBQUM7UUFDcEMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3ZDLGNBQWMsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELG9FQUFvRTtJQUM3RCxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQWU7UUFFekMsdUNBQXVDO1FBQ3ZDLElBQUssTUFBTSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUM7WUFDaEMsT0FBTztRQUVYLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUTtZQUN4QixjQUFjLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFMUIsTUFBTSxDQUFDLHFCQUFxQixDQUFDLFlBQVksRUFDckMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFZLENBQ3JELENBQUM7SUFDTixDQUFDO0lBRUQseUVBQXlFO0lBQ2xFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBaUI7UUFFbEMsSUFBSSxHQUFHLEdBQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUM7UUFDMUMsSUFBSSxJQUFJLEdBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUUsQ0FBQztRQUNuQyxJQUFJLEtBQUssR0FBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzVDLElBQUksTUFBTSxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsS0FBSztZQUNoQixDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDO1lBQzdCLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztJQUN2QyxDQUFDO0NBQ0o7QUM1Q0QscUVBQXFFO0FBRXJFLHNFQUFzRTtBQUN0RSxNQUFNLGVBQWU7SUFLakIsd0RBQXdEO0lBQ2hELE1BQU0sQ0FBQyxJQUFJO1FBRWYsMEVBQTBFO1FBQzFFLGVBQWUsQ0FBQyxRQUFRLEdBQVUsR0FBRyxDQUFDLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQzFFLGVBQWUsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFPLEVBQUUsQ0FBQztRQUNyQyxlQUFlLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDeEMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0lBRUQsb0VBQW9FO0lBQzdELE1BQU0sQ0FBQyxlQUFlLENBQUMsU0FBa0I7UUFFNUMsdUNBQXVDO1FBQ3ZDLElBQUssU0FBUyxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUM7WUFDekMsT0FBTztRQUVYLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUTtZQUN6QixlQUFlLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFM0IsSUFBSSxHQUFHLEdBQVEsR0FBRyxDQUFDLFdBQVcsQ0FBQyxTQUF3QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2hFLElBQUksTUFBTSxHQUFLLGVBQWUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBZ0IsQ0FBQztRQUN2RSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFdEMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQztJQUMxRCxDQUFDO0NBQ0o7QUNsQ0QscUVBQXFFO0FBRXJFLGlDQUFpQztBQUVqQywrQkFBK0I7QUFFL0I7Ozs7R0FJRztBQUNILE1BQU0sY0FBZSxTQUFRLE9BQU87SUFLaEMsWUFBbUIsTUFBbUI7UUFFbEMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBTGxCLHlFQUF5RTtRQUN4RCxnQkFBVyxHQUFrQyxFQUFFLENBQUM7UUFNN0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1FBRS9CLGdGQUFnRjtRQUNoRixrRkFBa0Y7UUFDbEYsbURBQW1EO1FBQ25ELE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUUsQ0FBQztJQUM3RSxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSSxNQUFNLENBQUMsTUFBYyxFQUFFLFFBQXdCO1FBRWxELElBQUksTUFBTSxHQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDN0IsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUM7UUFFckMsa0NBQWtDO1FBQ2xDLElBQUksQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxDQUFDO2FBQzdDLE9BQU8sQ0FBRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBRSxDQUFDO1FBRXZDLElBQUksQ0FBQyxPQUFPLElBQUksT0FBTyxLQUFLLE1BQU07WUFDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFakMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRUQsOENBQThDO0lBQ3ZDLGFBQWEsQ0FBQyxJQUFZO1FBRTdCLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFakMsSUFBSSxDQUFDLEtBQUs7WUFBRSxPQUFPO1FBRW5CLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekIsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2xCLENBQUM7SUFFRCxzRUFBc0U7SUFDL0QsTUFBTSxDQUFDLFVBQWdDO1FBRTFDLElBQUksS0FBSyxHQUFHLENBQUMsT0FBTyxVQUFVLEtBQUssUUFBUSxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQztZQUM1QixDQUFDLENBQUMsVUFBVSxDQUFDO1FBRWpCLElBQUksQ0FBQyxLQUFLO1lBQUUsT0FBTztRQUVuQixLQUFLLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xDLEtBQUssQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDcEIsS0FBSyxDQUFDLEtBQUssR0FBTSxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxxREFBcUQ7SUFDOUMsT0FBTyxDQUFDLElBQVk7UUFFdkIsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxJQUFJLElBQUksR0FBSSxHQUFHLENBQUMsdUJBQXVCLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWxELElBQUksQ0FBQyxLQUFLO1lBQUUsT0FBTztRQUVuQixLQUFLLENBQUMsWUFBWSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNuQyxLQUFLLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xDLEtBQUssQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBRWpCLGlFQUFpRTtRQUNqRSxJQUFJLElBQUk7WUFDSixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDckIsQ0FBQztJQUVELGtEQUFrRDtJQUMxQyxTQUFTLENBQUMsSUFBWTtRQUUxQixPQUFPLElBQUksQ0FBQyxZQUFZO2FBQ25CLGFBQWEsQ0FBQyxnQkFBZ0IsSUFBSSxHQUFHLENBQWdCLENBQUM7SUFDL0QsQ0FBQztJQUVELHdEQUF3RDtJQUNoRCxVQUFVLENBQUMsSUFBWTtRQUUzQixJQUFJLE9BQU8sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QyxJQUFJLE1BQU0sR0FBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDekIsSUFBSSxLQUFLLEdBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV2QyxJQUFJLENBQUMsS0FBSyxFQUNWO1lBQ0ksSUFBSSxNQUFNLEdBQVMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoRCxNQUFNLENBQUMsU0FBUyxHQUFHLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN4QyxNQUFNLENBQUMsUUFBUSxHQUFJLENBQUMsQ0FBQyxDQUFDO1lBRXRCLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEUsS0FBSyxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7WUFFcEIsS0FBSyxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDaEMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMxQixJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUN4QztRQUVELElBQUksS0FBSyxHQUFlLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDN0IsS0FBSyxDQUFDLFNBQVMsR0FBUyxPQUFPLENBQUM7UUFDaEMsS0FBSyxDQUFDLEtBQUssR0FBYSxJQUFJLENBQUMsU0FBUyxDQUFDO1FBQ3ZDLEtBQUssQ0FBQyxRQUFRLEdBQVUsQ0FBQyxDQUFDLENBQUM7UUFFM0IsS0FBSyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3QixDQUFDO0NBQ0o7QUNoSUQscUVBQXFFO0FBRXJFLHdEQUF3RDtBQUN4RCxNQUFNLGVBQWU7SUFLakIsd0RBQXdEO0lBQ2hELE1BQU0sQ0FBQyxJQUFJO1FBRWYsZUFBZSxDQUFDLFFBQVEsR0FBVSxHQUFHLENBQUMsT0FBTyxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDMUUsZUFBZSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQU8sRUFBRSxDQUFDO1FBQ3JDLGVBQWUsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUN4QyxlQUFlLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFLRDs7OztPQUlHO0lBQ0gsWUFBbUIsSUFBWTtRQUUzQixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVE7WUFDekIsZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRTNCLElBQUksQ0FBQyxHQUFHLEdBQWEsZUFBZSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFnQixDQUFDO1FBQzdFLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRW5ELElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNwQyxDQUFDO0NBQ0o7QUNuQ0QscUVBQXFFO0FBRXJFLGtDQUFrQztBQUNsQyxNQUFlLE1BQU07SUFjakI7Ozs7T0FJRztJQUNILFlBQXNCLE1BQWM7UUFFaEMsSUFBSSxDQUFDLEdBQUcsR0FBUyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksTUFBTSxRQUFRLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsT0FBTyxHQUFLLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsTUFBTSxHQUFNLE1BQU0sQ0FBQztRQUV4QixJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sR0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sR0FBSyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBY0Q7OztPQUdHO0lBQ08sUUFBUSxDQUFDLEVBQVM7UUFFeEIsRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3BCLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbEIsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDbkMsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksSUFBSSxDQUFDLE1BQW1CO1FBRTNCLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLE1BQU0sQ0FBQztRQUN6QixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDbEIsQ0FBQztJQUVELHlCQUF5QjtJQUNsQixLQUFLO1FBRVIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO0lBQzNCLENBQUM7SUFFRCxrRUFBa0U7SUFDM0QsTUFBTTtRQUVULElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVTtZQUNoQixPQUFPO1FBRVgsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQ3pELElBQUksU0FBUyxHQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUMxRCxJQUFJLE9BQU8sR0FBTSxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdEQsSUFBSSxJQUFJLEdBQVMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDM0MsSUFBSSxJQUFJLEdBQVMsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUM7UUFDNUMsSUFBSSxPQUFPLEdBQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxHQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM3QyxJQUFJLE9BQU8sR0FBTyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUN4QyxJQUFJLE9BQU8sR0FBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBRTlDLG9DQUFvQztRQUNwQyxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsT0FBTyxFQUMxQjtZQUNJLDZCQUE2QjtZQUM3QixJQUFJLEdBQUcsQ0FBQyxRQUFRLEVBQ2hCO2dCQUNJLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUM7Z0JBRTlCLE9BQU8sR0FBRyxDQUFDLENBQUM7YUFDZjtpQkFFRDtnQkFDSSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQU0sU0FBUyxDQUFDO2dCQUNwQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsR0FBRyxPQUFPLElBQUksQ0FBQztnQkFFekMsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEdBQUcsSUFBSTtvQkFDckMsT0FBTyxHQUFHLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUM7YUFDbkU7U0FDSjtRQUVELDhFQUE4RTtRQUM5RSxzRUFBc0U7UUFDdEUsSUFBSSxPQUFPLEVBQ1g7WUFDSSxPQUFPLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBRSxHQUFHLENBQUMsQ0FBQztZQUN0RCxPQUFPLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBRSxHQUFHLENBQUMsQ0FBQztTQUN6RDtRQUVELGdDQUFnQzthQUMzQixJQUFJLE9BQU8sR0FBRyxDQUFDO1lBQ2hCLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFFaEIsa0NBQWtDO2FBQzdCLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxHQUFHLElBQUksRUFDL0M7WUFDSSxPQUFPLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQztZQUMzRCxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdkMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRTFDLHVDQUF1QztZQUN2QyxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksR0FBRyxJQUFJO2dCQUN0QyxPQUFPLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDO1lBRTNDLDRFQUE0RTtZQUM1RSxJQUFJLE9BQU8sR0FBRyxDQUFDO2dCQUNYLE9BQU8sR0FBRyxDQUFDLENBQUM7U0FDbkI7YUFFRDtZQUNJLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN2QyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDN0M7UUFFRCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQ3ZELElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBSSxPQUFPLEdBQUcsSUFBSSxDQUFDO0lBQ3pDLENBQUM7SUFFRCxvRUFBb0U7SUFDN0QsUUFBUTtRQUVYLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3JELENBQUM7Q0FDSjtBQzNKRCxxRUFBcUU7QUFFckUsaUNBQWlDO0FBRWpDLDZDQUE2QztBQUM3QyxNQUFNLFdBQVksU0FBUSxNQUFNO0lBUTVCO1FBRUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBTG5CLG1FQUFtRTtRQUMzRCxlQUFVLEdBQVksRUFBRSxDQUFDO1FBTTdCLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRW5ELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFO1lBQ3ZCLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRUQsZ0VBQWdFO0lBQ3pELElBQUksQ0FBQyxNQUFtQjtRQUUzQixLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRW5CLElBQUksQ0FBQyxVQUFVLEdBQVksR0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFM0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUVELGlFQUFpRTtJQUN2RCxRQUFRLENBQUMsQ0FBUTtRQUV2QixHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDNUQsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNO2FBQ1gsa0JBQWtCLENBQUMsa0NBQWtDLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQzthQUN4RSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDMUUsQ0FBQztJQUVTLE9BQU8sQ0FBQyxDQUFhLElBQTBCLENBQUM7SUFDaEQsT0FBTyxDQUFDLENBQWdCLElBQXVCLENBQUM7Q0FDN0Q7QUM5Q0QscUVBQXFFO0FBRXJFLGlDQUFpQztBQUVqQyw4Q0FBOEM7QUFDOUMsTUFBTSxZQUFhLFNBQVEsTUFBTTtJQUs3QjtRQUVJLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVoQixJQUFJLENBQUMsVUFBVSxHQUFZLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FBQztRQUUzQyxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDO0lBQ2hFLENBQUM7SUFFRCw0REFBNEQ7SUFDckQsSUFBSSxDQUFDLE1BQW1CO1FBRTNCLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFbkIsdUNBQXVDO1FBQ3ZDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELHdCQUF3QjtJQUNqQixLQUFLO1FBRVIsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUM5QixDQUFDO0lBRUQsc0NBQXNDO0lBQzVCLFFBQVEsQ0FBQyxDQUFRLElBQWdDLENBQUM7SUFDbEQsT0FBTyxDQUFDLEVBQWMsSUFBYyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFFLENBQUM7SUFDbkUsT0FBTyxDQUFDLEVBQWlCLElBQVcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBRSxDQUFDO0lBQ25FLFFBQVEsQ0FBQyxFQUFTLElBQWtCLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUU3RSx5RUFBeUU7SUFDakUsUUFBUSxDQUFDLEtBQWtCO1FBRS9CLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7UUFDbkMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2pFLENBQUM7Q0FDSjtBQ2pERCxxRUFBcUU7QUFFckUsaUNBQWlDO0FBRWpDLCtDQUErQztBQUMvQyxNQUFNLGFBQWMsU0FBUSxNQUFNO0lBZ0I5QjtRQUVJLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQVhyQixxRUFBcUU7UUFDN0QsZUFBVSxHQUFZLEVBQUUsQ0FBQztRQVk3QixJQUFJLENBQUMsVUFBVSxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsUUFBUSxHQUFLLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVqRCxvRUFBb0U7UUFDcEUsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUNiO1lBQ0ksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEdBQU0sS0FBSyxDQUFDO1lBQ2hDLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQztTQUN0QztJQUNMLENBQUM7SUFFRCxnRUFBZ0U7SUFDekQsSUFBSSxDQUFDLE1BQW1CO1FBRTNCLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFbkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsUUFBUSxHQUFLLE1BQU0sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLE1BQU0sR0FBTyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyxLQUFLLEdBQVEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDO1FBRXBFLElBQUksS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUVsRCxJQUFTLElBQUksQ0FBQyxRQUFRLElBQUksS0FBSyxLQUFLLENBQUM7WUFDakMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQzthQUN2QyxJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksS0FBSyxLQUFLLENBQUM7WUFDL0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7WUFFdEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBRWpDLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTdELElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxTQUFTLEVBQUU7WUFDL0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1lBQzFCLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQztTQUM5QjthQUFNO1lBQ0gsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDMUM7UUFFRCxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBTSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDNUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsbUVBQW1FO0lBQ3pELFFBQVEsQ0FBQyxDQUFRO1FBRXZCLDREQUE0RDtRQUM1RCxJQUFJLEdBQUcsR0FBTSxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3Qyx3QkFBd0I7UUFDeEIsSUFBSyxLQUFLLENBQUMsR0FBRyxDQUFDO1lBQ1gsT0FBTztRQUVYLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxTQUFTLEVBQUU7WUFDL0IsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFO2dCQUFFLEdBQUcsR0FBRyxDQUFDLENBQUM7Z0JBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDO2FBQUU7WUFDdEQsSUFBSSxHQUFHLEdBQUcsRUFBRSxFQUFFO2dCQUFFLEdBQUcsR0FBRyxFQUFFLENBQUM7Z0JBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO2FBQUU7U0FDNUQ7UUFFRCxJQUFJLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDckIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsRUFBRTtZQUNqQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRXJCLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUU3QixJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsRUFDOUI7WUFDSSxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDOUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztTQUMzQzthQUNJLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUNqQztZQUNJLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1NBQ3pDO1FBRUQsR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMzQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU07YUFDWCxrQkFBa0IsQ0FBQyxvQ0FBb0MsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDO2FBQzFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVTLE9BQU8sQ0FBQyxDQUFhLElBQTBCLENBQUM7SUFDaEQsT0FBTyxDQUFDLENBQWdCLElBQXVCLENBQUM7Q0FDN0Q7QUM3R0QscUVBQXFFO0FBRXJFLGlDQUFpQztBQUVqQyxtREFBbUQ7QUFDbkQsTUFBTSxXQUFZLFNBQVEsTUFBTTtJQUs1QjtRQUVJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVmLElBQUksQ0FBQyxVQUFVLEdBQVksSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDO1FBRTFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUM7SUFDOUQsQ0FBQztJQUVELGlFQUFpRTtJQUMxRCxJQUFJLENBQUMsTUFBbUI7UUFFM0IsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVuQixxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUQsd0JBQXdCO0lBQ2pCLEtBQUs7UUFFUixLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzlCLENBQUM7SUFFRCxzQ0FBc0M7SUFDNUIsUUFBUSxDQUFDLENBQVEsSUFBZ0MsQ0FBQztJQUNsRCxPQUFPLENBQUMsRUFBYyxJQUFjLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUUsQ0FBQztJQUNuRSxPQUFPLENBQUMsRUFBaUIsSUFBVyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFFLENBQUM7SUFDbkUsUUFBUSxDQUFDLEVBQVMsSUFBa0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTdFLHdFQUF3RTtJQUNoRSxRQUFRLENBQUMsS0FBa0I7UUFFL0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztRQUNsQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDL0QsQ0FBQztDQUNKO0FDakRELHFFQUFxRTtBQUVyRSxpQ0FBaUM7QUFFakMsaURBQWlEO0FBQ2pELE1BQU0sZUFBZ0IsU0FBUSxNQUFNO0lBUWhDO1FBRUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBTHZCLDZFQUE2RTtRQUNyRSxlQUFVLEdBQVksRUFBRSxDQUFDO1FBTTdCLElBQUksQ0FBQyxVQUFVLEdBQVksSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQseUVBQXlFO0lBQ2xFLElBQUksQ0FBQyxNQUFtQjtRQUUzQixLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRW5CLElBQUksR0FBRyxHQUFTLEdBQUcsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLElBQUksR0FBRyxHQUFTLFFBQVEsQ0FBRSxHQUFHLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBRSxDQUFDO1FBQzNELElBQUksU0FBUyxHQUFHLE1BQU0sQ0FBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUUsQ0FBRSxDQUFDO1FBRTFELElBQUksQ0FBQyxVQUFVLEdBQVksR0FBRyxDQUFDO1FBQy9CLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRXhCLGlGQUFpRjtRQUNqRixzREFBc0Q7UUFDdEQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUNsRDtZQUNJLElBQUksTUFBTSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFMUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBZ0IsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM1RCxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU1QixNQUFNLENBQUMsU0FBUyxHQUFLLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN2RCxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7WUFFbEMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztTQUM3QztJQUNMLENBQUM7SUFFRCx3QkFBd0I7SUFDakIsS0FBSztRQUVSLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVELHNDQUFzQztJQUM1QixRQUFRLENBQUMsQ0FBUSxJQUFnQyxDQUFDO0lBQ2xELE9BQU8sQ0FBQyxFQUFjLElBQWMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBRSxDQUFDO0lBQ25FLE9BQU8sQ0FBQyxFQUFpQixJQUFXLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUUsQ0FBQztJQUNuRSxRQUFRLENBQUMsRUFBUyxJQUFrQixJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFN0UsNEVBQTRFO0lBQ3BFLFFBQVEsQ0FBQyxLQUFrQjtRQUUvQixJQUFJLEdBQUcsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUUsQ0FBQyxDQUFDO1FBRTFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDaEQsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDL0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7Q0FDSjtBQ3pFRCxxRUFBcUU7QUFFckUsaUNBQWlDO0FBRWpDLGdEQUFnRDtBQUNoRCxNQUFNLGNBQWUsU0FBUSxNQUFNO0lBTy9CO1FBRUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRWxCLElBQUksQ0FBQyxVQUFVLEdBQVksR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzFELElBQUksQ0FBQyxXQUFXLEdBQVcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzNELElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxlQUFlLENBQUM7UUFFN0Msb0VBQW9FO1FBQ3BFLElBQUksR0FBRyxDQUFDLEtBQUssRUFDYjtZQUNJLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxHQUFNLEtBQUssQ0FBQztZQUNoQyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sR0FBRyxRQUFRLENBQUM7U0FDdEM7SUFDTCxDQUFDO0lBRUQsZ0VBQWdFO0lBQ3pELElBQUksQ0FBQyxNQUFtQjtRQUUzQixLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRW5CLElBQUksS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO1FBRS9CLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDOUIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsb0VBQW9FO0lBQzFELFFBQVEsQ0FBQyxDQUFRO1FBRXZCLElBQUksTUFBTSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdDLHdCQUF3QjtRQUN4QixJQUFLLEtBQUssQ0FBRSxNQUFNLENBQUU7WUFDaEIsT0FBTztRQUVYLElBQUksTUFBTSxHQUFHLENBQUMsRUFBRTtZQUFFLE1BQU0sR0FBRyxDQUFDLENBQUM7WUFBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUM7U0FBRTtRQUM1RCxJQUFJLE1BQU0sR0FBRyxFQUFFLEVBQUU7WUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDO1lBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1NBQUU7UUFFL0QsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFFOUIsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXJFLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBRSxVQUFVLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFFLENBQUM7SUFDaEYsQ0FBQztJQUVELHNFQUFzRTtJQUM5RCxzQkFBc0I7UUFFMUIsSUFBSSxNQUFNLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0MsSUFBSSxJQUFJLEdBQUssS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFFMUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUssSUFBSSxDQUFDO1FBQ2pDLElBQUksSUFBSSxFQUNSO1lBQ0ksSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQU0sRUFBRSxDQUFDO1NBQ2xDO0lBQ0wsQ0FBQztJQUVTLE9BQU8sQ0FBQyxDQUFhLElBQTBCLENBQUM7SUFDaEQsT0FBTyxDQUFDLENBQWdCLElBQXVCLENBQUM7Q0FDN0Q7QUMxRUQscUVBQXFFO0FBRXJFLGlDQUFpQztBQUVqQywrQ0FBK0M7QUFDL0MsTUFBTSxhQUFjLFNBQVEsTUFBTTtJQVE5QjtRQUVJLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUxyQixxRUFBcUU7UUFDN0QsZUFBVSxHQUFZLEVBQUUsQ0FBQztRQU03QixJQUFJLENBQUMsVUFBVSxHQUFZLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFakQsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQztJQUNqRSxDQUFDO0lBRUQsNkRBQTZEO0lBQ3RELElBQUksQ0FBQyxNQUFtQjtRQUUzQixLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRW5CLElBQUksQ0FBQyxVQUFVLEdBQVksR0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFN0Qsd0NBQXdDO1FBQ3hDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBRSxDQUFDO0lBQ3ZFLENBQUM7SUFFRCx3QkFBd0I7SUFDakIsS0FBSztRQUVSLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVELHNDQUFzQztJQUM1QixRQUFRLENBQUMsQ0FBUSxJQUFnQyxDQUFDO0lBQ2xELE9BQU8sQ0FBQyxFQUFjLElBQWMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBRSxDQUFDO0lBQ25FLE9BQU8sQ0FBQyxFQUFpQixJQUFXLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUUsQ0FBQztJQUNuRSxRQUFRLENBQUMsRUFBUyxJQUFrQixJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFN0UsMEVBQTBFO0lBQ2xFLFFBQVEsQ0FBQyxLQUFrQjtRQUUvQixHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN2RCxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU07YUFDWCxrQkFBa0IsQ0FBQyxvQ0FBb0MsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDO2FBQzFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ25FLENBQUM7Q0FDSjtBQ3hERCxxRUFBcUU7QUFFckUsaUNBQWlDO0FBRWpDLCtDQUErQztBQUMvQyxNQUFNLGFBQWMsU0FBUSxNQUFNO0lBVTlCLFlBQW1CLE1BQWMsU0FBUztRQUV0QyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFQZixxRUFBcUU7UUFDM0QsZUFBVSxHQUFZLEVBQUUsQ0FBQztRQVEvQixJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDdEIsYUFBYSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFN0QsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRCwyREFBMkQ7SUFDcEQsSUFBSSxDQUFDLE1BQW1CO1FBRTNCLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4QixDQUFDO0lBRUQscUZBQXFGO0lBQzNFLG1CQUFtQixDQUFDLE1BQW1CO1FBRTdDLElBQUksT0FBTyxHQUFPLGFBQWEsQ0FBQyxPQUFPLENBQUM7UUFDeEMsSUFBSSxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVyRCxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDM0MsT0FBTyxDQUFDLGFBQWEsQ0FBRSxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUUsQ0FBQztRQUMvRCxPQUFPLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztRQUU3QixJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsOENBQThDO0lBQ3BDLFFBQVEsQ0FBQyxDQUFRLElBQWdDLENBQUM7SUFDbEQsT0FBTyxDQUFDLEVBQWMsSUFBYyxhQUFhLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEUsT0FBTyxDQUFDLEVBQWlCLElBQVcsYUFBYSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hFLFFBQVEsQ0FBQyxFQUFTLElBQWtCLGFBQWEsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVuRiwwRUFBMEU7SUFDbEUsZUFBZSxDQUFDLEtBQWtCO1FBRXRDLElBQUksS0FBSyxHQUFHLG9DQUFvQyxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUM7UUFDbkUsSUFBSSxJQUFJLEdBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUUsQ0FBQztRQUNuQyxJQUFJLElBQUksR0FBSSxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUxQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTTthQUNYLGtCQUFrQixDQUFDLEtBQUssQ0FBQzthQUN6QixPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQ3hELENBQUM7Q0FDSjtBQy9ERCxxRUFBcUU7QUFFckUsaUNBQWlDO0FBQ2pDLHdDQUF3QztBQUN4QyxtREFBbUQ7QUFFbkQsb0RBQW9EO0FBQ3BELE1BQU0saUJBQWtCLFNBQVEsYUFBYTtJQWV6QztRQUVJLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVyQixJQUFJLENBQUMsT0FBTyxHQUFRLEdBQUcsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsTUFBTSxHQUFTLEdBQUcsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsUUFBUSxHQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsTUFBTSxHQUFTLEdBQUcsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsU0FBUyxHQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFZLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsWUFBWSxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFhLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsTUFBTSxHQUFTLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFNUQsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7WUFDdEUsZ0VBQWdFO2FBQy9ELEVBQUUsQ0FBRSxXQUFXLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBRTthQUNqRSxFQUFFLENBQUUsZUFBZSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUUsQ0FBQztJQUNuRSxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ08sdUJBQXVCLENBQUMsTUFBbUI7UUFFakQsOERBQThEO1FBQzlELGFBQWEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdEQsYUFBYSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDO1FBRTVDLElBQUksQ0FBQyxVQUFVLEdBQUcsR0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckQsSUFBSSxPQUFPLEdBQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRXBFLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFakUsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUU5QiwrREFBK0Q7UUFDL0QsT0FBTyxDQUFDLE9BQU8sQ0FBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQztRQUNwQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxzQ0FBc0M7SUFDNUIsUUFBUSxDQUFDLEVBQVMsSUFBVyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUU1RCx3REFBd0Q7SUFDOUMsT0FBTyxDQUFDLEVBQWM7UUFFNUIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVsQixJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLFFBQVE7WUFDM0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkMsNkVBQTZFO1FBQzdFLElBQUksRUFBRSxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsTUFBTTtZQUN6QixJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELCtEQUErRDtJQUNyRCxPQUFPLENBQUMsRUFBaUI7UUFFL0IsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVsQixJQUFJLEdBQUcsR0FBTyxFQUFFLENBQUMsR0FBRyxDQUFDO1FBQ3JCLElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUE0QixDQUFDO1FBRXBELCtDQUErQztRQUMvQyxJQUFLLENBQUMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO1lBQzlDLE9BQU87UUFFWCw2QkFBNkI7UUFDN0IsSUFBSSxHQUFHLEtBQUssV0FBVyxJQUFJLEdBQUcsS0FBSyxZQUFZLEVBQy9DO1lBQ0ksSUFBSSxHQUFHLEdBQUcsQ0FBQyxHQUFHLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekMsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDO1lBRWYsdUNBQXVDO1lBQ3ZDLElBQUksT0FBTyxDQUFDLGFBQWEsS0FBSyxJQUFJLENBQUMsU0FBUztnQkFDeEMsR0FBRyxHQUFHLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFFcEQscURBQXFEO2lCQUNoRCxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUM7Z0JBQ2YsR0FBRyxHQUFHLEdBQUcsQ0FBQyx1QkFBdUIsQ0FDN0IsT0FBTyxDQUFDLGlCQUFpQyxFQUFFLEdBQUcsQ0FDakQsQ0FBQzs7Z0JBRUYsR0FBRyxHQUFHLEdBQUcsQ0FBQyx1QkFBdUIsQ0FDN0IsT0FBTyxDQUFDLGdCQUFnQyxFQUFFLEdBQUcsQ0FDaEQsQ0FBQztZQUVOLElBQUksR0FBRztnQkFBRSxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDeEI7UUFFRCx3QkFBd0I7UUFDeEIsSUFBSSxHQUFHLEtBQUssUUFBUSxJQUFJLEdBQUcsS0FBSyxXQUFXO1lBQzNDLElBQUksT0FBTyxDQUFDLGFBQWEsS0FBSyxJQUFJLENBQUMsU0FBUyxFQUM1QztnQkFDSSw0Q0FBNEM7Z0JBQzVDLElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxzQkFBcUM7dUJBQzdDLE9BQU8sQ0FBQyxrQkFBcUM7dUJBQzdDLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBRTFCLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3JCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQzthQUNoQjtJQUNMLENBQUM7SUFFRCwyQ0FBMkM7SUFDbkMsWUFBWSxDQUFDLEtBQWtCO1FBRW5DLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUUsQ0FBQyxDQUFDO1FBRWhELDhDQUE4QztRQUM5QyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBRWQsMkVBQTJFO1FBQzNFLElBQUksR0FBRyxDQUFDLFFBQVE7WUFDWixRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDOztZQUVyQixRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFFRCw4RUFBOEU7SUFDdEUsa0JBQWtCLENBQUMsRUFBdUI7UUFFOUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGNBQWUsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO0lBQzdFLENBQUM7SUFFRCxtREFBbUQ7SUFDM0MsVUFBVSxDQUFDLEVBQXVCO1FBRXRDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGNBQWM7WUFDdkIsT0FBTztRQUVYLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsYUFBYSxLQUFLLElBQUksQ0FBQyxNQUFNO1lBQ3BELElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQzs7WUFFcEMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssR0FBRyxDQUFDLElBQVk7UUFFcEIsSUFBSSxRQUFRLEdBQUcsSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFekMseUNBQXlDO1FBQ3pDLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFFaEMsMkNBQTJDO1FBQzNDLGFBQWEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXBDLDhCQUE4QjtRQUM5QixRQUFRLENBQUMsR0FBRyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXpELE9BQU8sUUFBUSxDQUFDO0lBQ3BCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssTUFBTSxDQUFDLEtBQWtCO1FBRTdCLElBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7WUFDOUIsTUFBTSxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztRQUV6RSw2Q0FBNkM7UUFDN0MsYUFBYSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUUsQ0FBQyxDQUFDO1FBRXJELEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNmLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUVkLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUM7WUFDcEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ3pDLENBQUM7SUFFRCx3RUFBd0U7SUFDaEUsTUFBTTtRQUVWLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDO1FBRXZDLGdDQUFnQztRQUNoQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQztZQUNyQixPQUFPO1FBRVgsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRWQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQ3hDO1lBQ0ksSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBZ0IsQ0FBQztZQUV2QyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFFLENBQUMsQ0FBQztTQUNyQztRQUVELElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0RSxJQUFJLEtBQUssR0FBTSx3Q0FBd0MsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDO1FBRTFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEQsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNO2FBQ1gsa0JBQWtCLENBQUMsS0FBSyxDQUFDO2FBQ3pCLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLENBQUM7SUFDNUQsQ0FBQztDQUNKO0FDeE9ELHFFQUFxRTtBQUVyRSxpQ0FBaUM7QUFFakMsNENBQTRDO0FBQzVDLE1BQU0sVUFBVyxTQUFRLE1BQU07SUFRM0I7UUFFSSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFMbEIsa0VBQWtFO1FBQzFELGVBQVUsR0FBWSxFQUFFLENBQUM7UUFNN0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVELHVEQUF1RDtJQUNoRCxJQUFJLENBQUMsTUFBbUI7UUFFM0IsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVuQixJQUFJLENBQUMsVUFBVSxHQUFZLEdBQUcsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzlELElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTFELElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxnRUFBZ0U7SUFDdEQsUUFBUSxDQUFDLENBQVE7UUFFdkIsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pELEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTTthQUNYLGtCQUFrQixDQUFDLGlDQUFpQyxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUM7YUFDdkUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFUyxPQUFPLENBQUMsQ0FBYSxJQUEwQixDQUFDO0lBQ2hELE9BQU8sQ0FBQyxDQUFnQixJQUF1QixDQUFDO0NBQzdEO0FDM0NELHFFQUFxRTtBQUVyRSxzRkFBc0Y7QUFDdEYsTUFBZSxVQUFVO0lBUXJCLFlBQXVCLElBQW1CO1FBRXRDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ3JCLENBQUM7SUFFRCxtRUFBbUU7SUFDNUQsSUFBSTtRQUVQLElBQUksUUFBUSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVwRSxJQUFJLENBQUMsUUFBUTtZQUNULE9BQU87UUFFWCxJQUNBO1lBQ0ksSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNsQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztTQUMvQjtRQUNELE9BQU8sR0FBRyxFQUNWO1lBQ0ksS0FBSyxDQUFFLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUUsQ0FBQztZQUN6QyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ3RCO0lBQ0wsQ0FBQztJQUVELHNEQUFzRDtJQUMvQyxJQUFJO1FBRVAsSUFDQTtZQUNJLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFFLFVBQVUsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBRSxDQUFDO1NBQ2hGO1FBQ0QsT0FBTyxHQUFHLEVBQ1Y7WUFDSSxLQUFLLENBQUUsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBRSxDQUFDO1lBQ3pDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDdEI7SUFDTCxDQUFDO0lBRUQsMkVBQTJFO0lBQ3BFLEtBQUs7UUFFUixJQUNBO1lBQ0ksTUFBTSxDQUFDLE1BQU0sQ0FBRSxJQUFJLEVBQUUsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUUsQ0FBQztZQUN2QyxNQUFNLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUM7U0FDM0Q7UUFDRCxPQUFPLEdBQUcsRUFDVjtZQUNJLEtBQUssQ0FBRSxDQUFDLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFFLENBQUM7WUFDMUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUN0QjtJQUNMLENBQUM7O0FBMURELDZEQUE2RDtBQUNyQyx1QkFBWSxHQUFZLFVBQVUsQ0FBQztBQ04vRCxxRUFBcUU7QUFFckUsb0NBQW9DO0FBRXBDLDBDQUEwQztBQUMxQyxNQUFNLE1BQU8sU0FBUSxVQUFrQjtJQXVFbkMsWUFBbUIsV0FBb0IsS0FBSztRQUV4QyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUF2RWxCLGdEQUFnRDtRQUN6QyxvQkFBZSxHQUFhLEtBQUssQ0FBQztRQUN6QyxzQ0FBc0M7UUFDL0IsbUJBQWMsR0FBYyxLQUFLLENBQUM7UUFDekMscUNBQXFDO1FBQzlCLGNBQVMsR0FBbUIsR0FBRyxDQUFDO1FBQ3ZDLG9DQUFvQztRQUM3QixnQkFBVyxHQUFpQixHQUFHLENBQUM7UUFDdkMsbUNBQW1DO1FBQzVCLGVBQVUsR0FBa0IsR0FBRyxDQUFDO1FBQ3ZDLG9EQUFvRDtRQUM3QyxhQUFRLEdBQW9CLEVBQUUsQ0FBQztRQUN0Qyw4REFBOEQ7UUFDdkQsa0JBQWEsR0FBZSxFQUFFLENBQUM7UUFDdEMsb0NBQW9DO1FBQzdCLGVBQVUsR0FBa0IsSUFBSSxDQUFDO1FBQ3hDLHVEQUF1RDtRQUNoRCxZQUFPLEdBQXFCLDJDQUEyQyxDQUFDO1FBRS9FLGtFQUFrRTtRQUMxRCxpQkFBWSxHQUFZLEVBQUUsQ0FBQztRQUNuQywrQ0FBK0M7UUFDdkMsZUFBVSxHQUFjLGlCQUFpQixDQUFDO1FBbUQ5QyxJQUFJLFFBQVE7WUFDUixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDcEIsQ0FBQztJQW5ERDs7O09BR0c7SUFDSCxJQUFJLFdBQVc7UUFFWCw0Q0FBNEM7UUFDNUMsSUFBSSxJQUFJLENBQUMsWUFBWSxLQUFLLEVBQUU7WUFDeEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDO1FBRTdCLG1DQUFtQztRQUNuQyxJQUFJLE1BQU0sR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQztRQUV0QyxLQUFLLElBQUksSUFBSSxJQUFJLE1BQU07WUFDdkIsSUFBSyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU87Z0JBQy9ELE9BQU8sSUFBSSxDQUFDO1FBRWhCLGdDQUFnQztRQUNoQyxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVELHNEQUFzRDtJQUN0RCxJQUFJLFdBQVcsQ0FBQyxLQUFhO1FBRXpCLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO0lBQzlCLENBQUM7SUFFRCxvRUFBb0U7SUFDcEUsSUFBSSxTQUFTO1FBRVQseUNBQXlDO1FBQ3pDLElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTdDLElBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDbkMsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFakMsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQzNCLENBQUM7SUFFRCxvRUFBb0U7SUFDcEUsSUFBSSxTQUFTLENBQUMsS0FBYTtRQUV2QixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztJQUM1QixDQUFDO0NBU0o7QUNuRkQscUVBQXFFO0FBS3JFLHVFQUF1RTtBQUN2RSxNQUFNLGVBQWU7SUFBckI7UUFJSSxNQUFNO1FBRU4sWUFBTyxHQUFTLHlDQUF5QyxDQUFDO1FBQzFELGdCQUFXLEdBQUssQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLHFDQUFxQyxDQUFDLEdBQUcsQ0FBQztRQUN0RSxpQkFBWSxHQUFJLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxtQ0FBbUMsQ0FBQyxHQUFHLENBQUM7UUFDcEUsaUJBQVksR0FBSSxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsOENBQThDLENBQUMsR0FBRyxDQUFDO1FBQy9FLGtCQUFhLEdBQUcsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLHVDQUF1QyxDQUFDLEdBQUcsQ0FBQztRQUN4RSxnQkFBVyxHQUFLLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQywrQ0FBK0MsQ0FBQyxHQUFHLENBQUM7UUFFaEYsUUFBUTtRQUVSLHVCQUFrQixHQUFJLHFDQUFxQyxDQUFDO1FBQzVELHFCQUFnQixHQUFNLHlEQUF5RCxDQUFDO1FBQ2hGLHFCQUFnQixHQUFNLGlEQUFpRCxDQUFDO1FBQ3hFLG1CQUFjLEdBQVEsbUJBQW1CLENBQUM7UUFDMUMsdUJBQWtCLEdBQUksdUNBQXVDLENBQUM7UUFDOUQsb0JBQWUsR0FBTyxDQUFDLEdBQVcsRUFBRSxFQUFFLENBQ2xDLCtDQUErQyxHQUFHLEVBQUUsQ0FBQztRQUN6RCx3QkFBbUIsR0FBRyxDQUFDLENBQVMsRUFBRSxFQUFFLENBQ2hDLGdEQUFnRCxDQUFDLHVCQUF1QixDQUFDO1FBRTdFLFNBQVM7UUFFVCxxQkFBZ0IsR0FBSSxDQUFDLEdBQVEsRUFBRSxFQUFFLENBQUMsNEJBQTRCLEdBQUcsRUFBRSxDQUFDO1FBQ3BFLHFCQUFnQixHQUFJLENBQUMsR0FBUSxFQUFFLEVBQUUsQ0FBQyw0QkFBNEIsR0FBRyxFQUFFLENBQUM7UUFDcEUsc0JBQWlCLEdBQUcsQ0FBQyxHQUFRLEVBQUUsRUFBRSxDQUFDLDZCQUE2QixHQUFHLEVBQUUsQ0FBQztRQUVyRSxXQUFXO1FBRVgsb0NBQStCLEdBQUcsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUM1Qyx1Q0FBdUMsQ0FBQyxzQ0FBc0MsQ0FBQztRQUVuRix1QkFBa0IsR0FBSyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDO1FBQzNELHFCQUFnQixHQUFPLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FDOUIsK0RBQStELENBQUMsSUFBSSxDQUFDO1FBQ3pFLHlCQUFvQixHQUFHLEdBQUcsRUFBRSxDQUFDLG9EQUFvRCxDQUFDO1FBRWxGLFVBQVU7UUFFVixpQkFBWSxHQUFPLGFBQWEsQ0FBQztRQUNqQyxpQkFBWSxHQUFPLHFCQUFxQixDQUFDO1FBQ3pDLG9CQUFlLEdBQUksd0JBQXdCLENBQUM7UUFDNUMsaUJBQVksR0FBTyx1QkFBdUIsQ0FBQztRQUMzQyxpQkFBWSxHQUFPLDJCQUEyQixDQUFDO1FBQy9DLHFCQUFnQixHQUFHLGVBQWUsQ0FBQztRQUVuQyxTQUFTO1FBRVQsZ0JBQVcsR0FBUyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsZ0NBQWdDLENBQUMsSUFBSSxDQUFDO1FBQ3RFLGlCQUFZLEdBQVEsNkJBQTZCLENBQUM7UUFDbEQsa0JBQWEsR0FBTyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsaUNBQWlDLENBQUMsSUFBSSxDQUFDO1FBQ3ZFLGdCQUFXLEdBQVMsb0NBQW9DLENBQUM7UUFDekQsbUJBQWMsR0FBTSxDQUFDLENBQU0sRUFBRSxDQUFNLEVBQUUsRUFBRSxDQUNuQywrQkFBK0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2hELG9CQUFlLEdBQUssQ0FBQyxDQUFNLEVBQUUsQ0FBTSxFQUFFLEVBQUUsQ0FDbkMsZ0NBQWdDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNqRCxvQkFBZSxHQUFLLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FDM0IscURBQXFELENBQUMsSUFBSSxDQUFDO1FBQy9ELG1CQUFjLEdBQU0sd0NBQXdDLENBQUM7UUFDN0Qsa0JBQWEsR0FBTyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsa0NBQWtDLENBQUMsSUFBSSxDQUFDO1FBQ3hFLGtCQUFhLEdBQU8sQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLGtDQUFrQyxDQUFDLElBQUksQ0FBQztRQUN4RSxzQkFBaUIsR0FBRyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsdUNBQXVDLENBQUMsSUFBSSxDQUFDO1FBQzdFLGVBQVUsR0FBVSxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsK0JBQStCLENBQUMsSUFBSSxDQUFDO1FBRXJFLGdCQUFXLEdBQWdCLGdCQUFnQixDQUFDO1FBQzVDLDJCQUFzQixHQUFLLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUM7UUFDckUsMEJBQXFCLEdBQU0sQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQztRQUNoRSw2QkFBd0IsR0FBRyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDO1FBRW5FLFVBQVU7UUFFViwwQkFBcUIsR0FBRyx3REFBd0QsQ0FBQztRQUVqRixVQUFVO1FBRVYsaUJBQVksR0FBUyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsZ0NBQWdDLENBQUMsV0FBVyxDQUFDO1FBQzlFLGtCQUFhLEdBQVEsZ0JBQWdCLENBQUM7UUFDdEMsbUJBQWMsR0FBTyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsMEJBQTBCLENBQUMsV0FBVyxDQUFDO1FBQ3hFLGlCQUFZLEdBQVMsb0JBQW9CLENBQUM7UUFDMUMscUJBQWdCLEdBQUssQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLDBCQUEwQixDQUFDLFdBQVcsQ0FBQztRQUN4RSxvQkFBZSxHQUFNLGlCQUFpQixDQUFDO1FBQ3ZDLG1CQUFjLEdBQU8sQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQztRQUN6RSxtQkFBYyxHQUFPLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQywyQkFBMkIsQ0FBQyxXQUFXLENBQUM7UUFDekUsdUJBQWtCLEdBQUcsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLGlDQUFpQyxDQUFDLFdBQVcsQ0FBQztRQUMvRSxnQkFBVyxHQUFVLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyx3QkFBd0IsQ0FBQyxXQUFXLENBQUM7UUFFdEUsZ0JBQVcsR0FBUSxpQkFBaUIsQ0FBQztRQUNyQyxpQkFBWSxHQUFPLG1CQUFtQixDQUFDO1FBQ3ZDLGNBQVMsR0FBVSxjQUFjLENBQUM7UUFDbEMsZUFBVSxHQUFTLHVDQUF1QyxDQUFDO1FBQzNELGdCQUFXLEdBQVEsbUJBQW1CLENBQUM7UUFDdkMsb0JBQWUsR0FBSSw2QkFBNkIsQ0FBQztRQUNqRCxZQUFPLEdBQVksZUFBZSxDQUFDO1FBQ25DLGNBQVMsR0FBVSxxQkFBcUIsQ0FBQztRQUN6QyxlQUFVLEdBQVMsc0JBQXNCLENBQUM7UUFDMUMsbUJBQWMsR0FBSywyQkFBMkIsQ0FBQztRQUMvQyxhQUFRLEdBQVcsaUJBQWlCLENBQUM7UUFDckMsY0FBUyxHQUFVLG1CQUFtQixDQUFDO1FBQ3ZDLGtCQUFhLEdBQU0sNkJBQTZCLENBQUM7UUFDakQsb0JBQWUsR0FBSSxpQkFBaUIsQ0FBQztRQUNyQyxvQkFBZSxHQUFJLDBCQUEwQixDQUFDO1FBQzlDLGFBQVEsR0FBVyx1QkFBdUIsQ0FBQztRQUMzQyxjQUFTLEdBQVUsb0JBQW9CLENBQUM7UUFDeEMsa0JBQWEsR0FBTSw4QkFBOEIsQ0FBQztRQUNsRCxnQkFBVyxHQUFRLHVCQUF1QixDQUFDO1FBQzNDLGlCQUFZLEdBQU8sb0JBQW9CLENBQUM7UUFDeEMscUJBQWdCLEdBQUcscUNBQXFDLENBQUM7UUFDekQsYUFBUSxHQUFXLGdCQUFnQixDQUFDO1FBQ3BDLGVBQVUsR0FBUywwQkFBMEIsQ0FBQztRQUM5QyxlQUFVLEdBQVMsT0FBTyxDQUFDO1FBQzNCLGlCQUFZLEdBQU8sbUJBQW1CLENBQUM7UUFDdkMsZUFBVSxHQUFTLDhDQUE4QyxDQUFDO1FBQ2xFLGdCQUFXLEdBQVEsK0NBQStDLENBQUM7UUFDbkUsZ0JBQVcsR0FBUSxxQkFBcUIsQ0FBQztRQUN6QyxrQkFBYSxHQUFNLCtDQUErQyxDQUFDO1FBQ25FLGdCQUFXLEdBQVEsa0VBQWtFLENBQUM7UUFDdEYsYUFBUSxHQUFXLGFBQWEsQ0FBQztRQUVqQyxXQUFXO1FBRVgsYUFBUSxHQUFhLG1CQUFtQixDQUFDO1FBQ3pDLGVBQVUsR0FBVyw0QkFBNEIsQ0FBQztRQUNsRCxxQkFBZ0IsR0FBSyxlQUFlLENBQUM7UUFDckMsdUJBQWtCLEdBQUcsMkJBQTJCLENBQUM7UUFDakQsa0JBQWEsR0FBUSw4REFBOEQ7WUFDL0UsV0FBVyxDQUFDO1FBQ2hCLFlBQU8sR0FBYyxjQUFjLENBQUM7UUFDcEMsY0FBUyxHQUFZLHlCQUF5QixDQUFDO1FBQy9DLGNBQVMsR0FBWSxRQUFRLENBQUM7UUFDOUIscUJBQWdCLEdBQUssT0FBTyxDQUFDO1FBQzdCLG9CQUFlLEdBQU0sZ0JBQWdCLENBQUM7UUFDdEMsa0JBQWEsR0FBUSxRQUFRLENBQUM7UUFDOUIsb0JBQWUsR0FBTSxPQUFPLENBQUM7UUFDN0IsbUJBQWMsR0FBTyxNQUFNLENBQUM7UUFDNUIsbUJBQWMsR0FBTyxhQUFhLENBQUM7UUFDbkMscUJBQWdCLEdBQUssZ0RBQWdELENBQUM7UUFDdEUsYUFBUSxHQUFhLDBCQUEwQixDQUFDO1FBRWhELHNCQUFpQixHQUFHLHVDQUF1QyxDQUFDO1FBQzVELGVBQVUsR0FBVSw0REFBNEQ7WUFDNUUsbUVBQW1FLENBQUM7UUFFeEUseURBQXlEO1FBQ3pELFlBQU8sR0FBRyw0QkFBNEIsQ0FBQztRQUN2QyxXQUFNLEdBQUk7WUFDTixNQUFNLEVBQU0sS0FBSyxFQUFNLEtBQUssRUFBTSxPQUFPLEVBQU0sTUFBTSxFQUFNLE1BQU0sRUFBSyxLQUFLO1lBQzNFLE9BQU8sRUFBSyxPQUFPLEVBQUksTUFBTSxFQUFLLEtBQUssRUFBUSxRQUFRLEVBQUksUUFBUSxFQUFHLFVBQVU7WUFDaEYsVUFBVSxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsUUFBUTtTQUNqRixDQUFDO0lBQ04sQ0FBQztDQUFBO0FDL0pELHFFQUFxRTtBQUVyRTs7OztHQUlHO0FBQ0gsTUFBTSxpQkFBaUI7SUFFbkIseUNBQXlDO0lBQ2xDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBa0I7UUFFbEMsSUFBSSxPQUFPLEdBQUcsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRXpELEdBQUcsQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFTLENBQUMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDcEQsR0FBRyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDekQsR0FBRyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEdBQU0sQ0FBQyxDQUFDO1FBRS9CLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLE9BQU8sQ0FBQztJQUNoRCxDQUFDO0lBRUQsdURBQXVEO0lBQ2hELE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBa0I7UUFFbkMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQVMsQ0FBQyxDQUFDLFlBQVksQ0FBQztRQUM1QyxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUM5QyxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBTSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELGdFQUFnRTtJQUN6RCxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQWtCO1FBRXBDLElBQUksT0FBTyxHQUFJLEdBQUcsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMxRCxJQUFJLFFBQVEsR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN2RCxJQUFJLE1BQU0sR0FBSyxHQUFHLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNyRCxJQUFJLEtBQUssR0FBTSxHQUFHLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVwRCxJQUFJLEdBQUcsR0FBTSxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxJQUFJLE1BQU0sR0FBRyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssTUFBTSxDQUFDO1lBQ2xELENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxRQUFRLEVBQUU7WUFDakMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVyQixJQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksUUFBUTtZQUMxQixNQUFNLElBQUksSUFBSSxRQUFRLEVBQUUsQ0FBQzthQUN4QixJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksTUFBTTtZQUN4QixNQUFNLElBQUksSUFBSSxNQUFNLEVBQUUsQ0FBQztRQUUzQixHQUFHLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBUyxDQUFDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3RELEdBQUcsQ0FBQyxVQUFVLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQztRQUNwQyxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBTSxDQUFDLENBQUM7UUFFL0IsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsT0FBTyxDQUFDO1FBRTVDLElBQUksUUFBUTtZQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLFFBQVEsQ0FBQztRQUM1RCxJQUFJLE1BQU07WUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBSyxNQUFNLENBQUM7UUFDMUQsSUFBSSxLQUFLO1lBQUssR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQU0sS0FBSyxDQUFDO0lBQzdELENBQUM7SUFFRCwrQkFBK0I7SUFDeEIsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFrQjtRQUVsQyxHQUFHLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBUyxDQUFDLENBQUMsV0FBVyxDQUFDO1FBQzNDLEdBQUcsQ0FBQyxVQUFVLENBQUMsV0FBVyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQzdDLEdBQUcsQ0FBQyxVQUFVLENBQUMsUUFBUSxHQUFNLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsd0RBQXdEO0lBQ2pELE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBa0I7UUFFbkMsSUFBSSxHQUFHLEdBQU0sR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BELElBQUksTUFBTSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXpDLEdBQUcsQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFZLEVBQUUsQ0FBQztRQUNuQyxHQUFHLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUM7UUFFcEMsSUFBSSxDQUFDLE1BQU0sRUFDWDtZQUNJLEdBQUcsQ0FBQyxVQUFVLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMxRCxPQUFPO1NBQ1Y7UUFFRCxvREFBb0Q7UUFDcEQsaUJBQWlCLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUU1QyxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBRSxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUUsQ0FBQztJQUN4RSxDQUFDO0lBRUQseUVBQXlFO0lBQ2xFLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBa0I7UUFFdEMsSUFBSSxHQUFHLEdBQVMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELElBQUksU0FBUyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQy9DLElBQUksU0FBUyxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRW5ELEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUVwQyxJQUFJLENBQUMsU0FBUyxFQUNkO1lBQ0ksR0FBRyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzdELE9BQU87U0FDVjtRQUVELElBQUksR0FBRyxHQUFHLFNBQVM7WUFDZixDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztZQUNyQixDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFckMsSUFBSSxNQUFNLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQWdCLENBQUM7UUFFcEQsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsU0FBUyxJQUFJLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUU1RCx1REFBdUQ7UUFDdkQsaUJBQWlCLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUU1QyxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBRSxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUUsQ0FBQztJQUN4RSxDQUFDO0lBRUQsb0NBQW9DO0lBQzdCLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBa0I7UUFFckMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQVMsQ0FBQyxDQUFDLGNBQWMsQ0FBQztRQUM5QyxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDekQsR0FBRyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEdBQU0sQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxxQ0FBcUM7SUFDOUIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFrQjtRQUVwQyxJQUFJLE9BQU8sR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFekQsR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQVMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN0RCxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzRCxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBTSxDQUFDLENBQUM7UUFFL0IsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsT0FBTyxDQUFDO0lBQ2hELENBQUM7SUFFRCw2QkFBNkI7SUFDdEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFrQjtRQUVwQyxJQUFJLE9BQU8sR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDekQsSUFBSSxJQUFJLEdBQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFNUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQVMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN0RCxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzRCxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBTSxDQUFDLENBQUM7UUFFL0IsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsT0FBTyxDQUFDO0lBQ2hELENBQUM7SUFFRCw2QkFBNkI7SUFDdEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFrQjtRQUV4QyxJQUFJLE9BQU8sR0FBTyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDN0QsSUFBSSxRQUFRLEdBQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDNUQsSUFBSSxXQUFXLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFN0QsR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQVMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzFELEdBQUcsQ0FBQyxVQUFVLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUN6QyxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBTSxDQUFDLENBQUM7UUFFL0IsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsT0FBTyxDQUFDO0lBQ2hELENBQUM7SUFFRCx3QkFBd0I7SUFDakIsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFrQjtRQUVqQyxJQUFJLE9BQU8sR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFekQsR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQVMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNuRCxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN4RCxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBTSxDQUFDLENBQUM7UUFFL0IsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsT0FBTyxDQUFDO0lBQ2hELENBQUM7SUFFRCx5QkFBeUI7SUFDbEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFrQjtRQUVoQyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFakQsaUJBQWlCO1FBQ2pCLEdBQUcsQ0FBQyxVQUFVLENBQUMsV0FBVyxHQUFNLEdBQUcsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDO1FBQzNELEdBQUcsQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFZLDhCQUE4QixHQUFHLEdBQUcsQ0FBQztRQUNyRSxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBUyxDQUFDLENBQUM7UUFDbEMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxDQUFDO0lBQ3hDLENBQUM7SUFFRCw0REFBNEQ7SUFDckQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFrQjtRQUVwQyxJQUFJLElBQUksR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQztRQUVuQyxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNLLE1BQU0sQ0FBQyxlQUFlLENBQUMsR0FBa0IsRUFBRSxHQUFXO1FBRTFELElBQUssQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUM7WUFDdkMsT0FBTztRQUVYLElBQUksTUFBTSxHQUFNLEdBQUcsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBRSxDQUFDO1FBQ3ZELElBQUksU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFFLEdBQUcsRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUUsQ0FBQztRQUVoRSxHQUFHLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxNQUFNLENBQUM7UUFFMUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRDs7Ozs7T0FLRztJQUNLLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBbUI7UUFFMUMsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUzQyxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM3QixHQUFHLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUU3QixPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0NBQ0o7QUN0T0QscUVBQXFFO0FDQXJFLHFFQUFxRTtBQUVyRTs7O0dBR0c7QUFDSCxNQUFNLE9BQU87SUFFVDs7Ozs7T0FLRztJQUNJLE9BQU8sQ0FBQyxTQUFzQixFQUFFLFFBQWdCLENBQUM7UUFFcEQsaUZBQWlGO1FBQ2pGLGlGQUFpRjtRQUNqRixpRkFBaUY7UUFDakYseUJBQXlCO1FBRXpCLElBQUksS0FBSyxHQUFLLDBDQUEwQyxDQUFDO1FBQ3pELElBQUksT0FBTyxHQUFHLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQTRCLENBQUM7UUFFM0UsaUNBQWlDO1FBQ2pDLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDO1lBQ3BCLE9BQU87UUFFWCxtREFBbUQ7UUFDbkQscUNBQXFDO1FBQ3JDLGdGQUFnRjtRQUNoRiw2Q0FBNkM7UUFDN0MsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUV0QixJQUFJLFdBQVcsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2pELElBQUksVUFBVSxHQUFJLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakQsSUFBSSxPQUFPLEdBQU87Z0JBQ2QsVUFBVSxFQUFFLE9BQU87Z0JBQ25CLFVBQVUsRUFBRSxVQUFVO2FBQ3pCLENBQUM7WUFFRixVQUFVLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLFdBQVcsQ0FBQztZQUV6Qyw4RUFBOEU7WUFDOUUsZ0RBQWdEO1lBQ2hELFFBQVEsV0FBVyxFQUNuQjtnQkFDSSxLQUFLLE9BQU87b0JBQVEsaUJBQWlCLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUFPLE1BQU07Z0JBQ2xFLEtBQUssUUFBUTtvQkFBTyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQU0sTUFBTTtnQkFDbEUsS0FBSyxTQUFTO29CQUFNLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFBSyxNQUFNO2dCQUNsRSxLQUFLLE9BQU87b0JBQVEsaUJBQWlCLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUFPLE1BQU07Z0JBQ2xFLEtBQUssUUFBUTtvQkFBTyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQU0sTUFBTTtnQkFDbEUsS0FBSyxXQUFXO29CQUFJLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFBRyxNQUFNO2dCQUNsRSxLQUFLLFVBQVU7b0JBQUssaUJBQWlCLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUFJLE1BQU07Z0JBQ2xFLEtBQUssU0FBUztvQkFBTSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQUssTUFBTTtnQkFDbEUsS0FBSyxTQUFTO29CQUFNLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFBSyxNQUFNO2dCQUNsRSxLQUFLLGFBQWE7b0JBQUUsaUJBQWlCLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUFDLE1BQU07Z0JBQ2xFLEtBQUssTUFBTTtvQkFBUyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQVEsTUFBTTtnQkFDbEUsS0FBSyxLQUFLO29CQUFVLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFBUyxNQUFNO2dCQUNsRTtvQkFBb0IsaUJBQWlCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUFLLE1BQU07YUFDckU7WUFFRCxPQUFPLENBQUMsYUFBYyxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDN0QsQ0FBQyxDQUFDLENBQUM7UUFFSCxpREFBaUQ7UUFDakQsSUFBSSxLQUFLLEdBQUcsRUFBRTtZQUNWLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQzs7WUFFbkMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDN0MsQ0FBQztDQUNKO0FDdkVELHFFQUFxRTtBQUVyRSw2REFBNkQ7QUFDN0QsTUFBTSxRQUFRO0lBRVYsaUZBQWlGO0lBQ3pFLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBVTtRQUVoQyxJQUFJLE1BQU0sR0FBTyxJQUFJLENBQUMsYUFBYyxDQUFDO1FBQ3JDLElBQUksVUFBVSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFeEMsMENBQTBDO1FBQzFDLElBQUksQ0FBQyxVQUFVLEVBQ2Y7WUFDSSxNQUFNLEdBQU8sTUFBTSxDQUFDLGFBQWMsQ0FBQztZQUNuQyxVQUFVLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUN2QztRQUVELDhDQUE4QztRQUM5QyxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssSUFBSSxDQUFDLFNBQVM7WUFDcEMsSUFBSSxVQUFVLEtBQUssV0FBVyxJQUFJLFVBQVUsS0FBSyxRQUFRO2dCQUNyRCxPQUFPLFVBQVUsQ0FBQyxXQUFXLENBQUM7UUFFbEMsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxZQUFZLEVBQ3ZDO1lBQ0ksSUFBSSxPQUFPLEdBQUcsSUFBbUIsQ0FBQztZQUNsQyxJQUFJLElBQUksR0FBTSxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRXRDLCtDQUErQztZQUMvQyxJQUFLLE9BQU8sQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDO2dCQUNsQyxPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUM7WUFFcEMsbUNBQW1DO1lBQ25DLElBQUksQ0FBQyxJQUFJO2dCQUNMLE9BQU8sVUFBVSxDQUFDLFdBQVcsQ0FBQztZQUVsQywyRUFBMkU7WUFDM0UsSUFBSSxJQUFJLEtBQUssV0FBVyxJQUFJLElBQUksS0FBSyxRQUFRO2dCQUN6QyxPQUFPLFVBQVUsQ0FBQyxXQUFXLENBQUM7U0FDckM7UUFFRCxPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUM7SUFDcEMsQ0FBQztJQVFELFlBQW1CLE1BQW1CO1FBRWxDLElBQUksQ0FBQyxNQUFNLEdBQU0sTUFBTSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLElBQUksQ0FBQyxRQUFRLEdBQUksRUFBRSxDQUFDO0lBQ3hCLENBQUM7SUFFTSxLQUFLO1FBRVIsa0ZBQWtGO1FBQ2xGLGlEQUFpRDtRQUVqRCxJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsUUFBUSxHQUFJLEVBQUUsQ0FBQztRQUNwQixJQUFJLFVBQVUsR0FBRyxRQUFRLENBQUMsZ0JBQWdCLENBQ3RDLElBQUksQ0FBQyxNQUFNLEVBQ1gsVUFBVSxDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUMsWUFBWSxFQUM5QyxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLEVBQ25DLEtBQUssQ0FDUixDQUFDO1FBRUYsT0FBUSxVQUFVLENBQUMsUUFBUSxFQUFFO1lBQzdCLElBQUksVUFBVSxDQUFDLFdBQVcsQ0FBQyxXQUFZLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRTtnQkFDakQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRWhELHFEQUFxRDtRQUVyRCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFFLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUUsQ0FBRSxDQUFDO1FBRWhGLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0MsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSyxPQUFPLENBQUMsSUFBVSxFQUFFLEdBQVc7UUFFbkMsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxTQUFTO1lBQ2hDLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVsQyxJQUFJLE9BQU8sR0FBRyxJQUFtQixDQUFDO1FBQ2xDLElBQUksSUFBSSxHQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFdEMsUUFBUSxJQUFJLEVBQ1o7WUFDSSxLQUFLLE9BQU8sQ0FBQyxDQUFPLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDM0QsS0FBSyxRQUFRLENBQUMsQ0FBTSxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkQsS0FBSyxTQUFTLENBQUMsQ0FBSyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDeEQsS0FBSyxPQUFPLENBQUMsQ0FBTyxPQUFPLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUMvQyxLQUFLLFVBQVUsQ0FBQyxDQUFJLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNyRCxLQUFLLFNBQVMsQ0FBQyxDQUFLLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN4RCxLQUFLLFNBQVMsQ0FBQyxDQUFLLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDN0QsS0FBSyxhQUFhLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDakUsS0FBSyxNQUFNLENBQUMsQ0FBUSxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDckQsS0FBSyxLQUFLLENBQUMsQ0FBUyxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDdkQ7UUFFRCxPQUFPLEVBQUUsQ0FBQztJQUNkLENBQUM7SUFFTyxhQUFhLENBQUMsR0FBVztRQUU3QixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUVuQyxPQUFPLENBQUUsSUFBSSxJQUFJLElBQUksQ0FBQyxXQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFFO1lBQ3ZELENBQUMsQ0FBQyxLQUFLO1lBQ1AsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUNoQixDQUFDO0lBRU8sV0FBVyxDQUFDLElBQVU7UUFFMUIsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWMsQ0FBQztRQUNqQyxJQUFJLElBQUksR0FBSyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BDLElBQUksSUFBSSxHQUFLLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVksQ0FBQyxDQUFDO1FBQzlDLElBQUksR0FBRyxHQUFNLEVBQUUsQ0FBQztRQUVoQiw4Q0FBOEM7UUFDOUMsSUFBSSxJQUFJLEtBQUssR0FBRztZQUNaLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVsQiw2Q0FBNkM7UUFDN0MsSUFBSyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQztZQUNyQixHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRW5CLDhDQUE4QztRQUM5QyxJQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUM7WUFDekIsT0FBTyxHQUFHLENBQUM7UUFFZiwwQ0FBMEM7UUFDMUMsSUFBSSxDQUFDLElBQUksRUFDVDtZQUNJLE1BQU0sR0FBRyxNQUFNLENBQUMsYUFBYyxDQUFDO1lBQy9CLElBQUksR0FBSyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ25DO1FBRUQsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNoQyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hDLElBQUksRUFBRSxHQUFJLEdBQUcsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRTNCLCtDQUErQztRQUMvQyxJQUFJLElBQUksS0FBSyxXQUFXO1lBQ3BCLEVBQUUsSUFBSSxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUV0QyxFQUFFLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNoQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWIsNkNBQTZDO1FBQzdDLElBQUssSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUM7WUFDbkIsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVuQixPQUFPLEdBQUcsQ0FBQztJQUNmLENBQUM7SUFFTyxZQUFZLENBQUMsT0FBb0IsRUFBRSxHQUFXO1FBRWxELElBQUksR0FBRyxHQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFFLENBQUM7UUFDMUMsSUFBSSxLQUFLLEdBQUssR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEMsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0QyxJQUFJLE1BQU0sR0FBSSxDQUFDLEdBQUcsRUFBRSxVQUFVLEtBQUssSUFBSSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBRWxELElBQUksT0FBTyxLQUFLLEtBQUs7WUFDakIsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVyQixPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRU8sYUFBYSxDQUFDLEdBQVc7UUFFN0IsSUFBSSxNQUFNLEdBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7UUFDL0IsSUFBSSxHQUFHLEdBQU8sT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2QyxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RDLElBQUksTUFBTSxHQUFJLENBQUMsSUFBSSxFQUFFLFVBQVUsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFFakQsSUFBSSxPQUFPLEtBQUssS0FBSztZQUNqQixNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXJCLE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFTyxjQUFjLENBQUMsT0FBb0I7UUFFdkMsSUFBSSxHQUFHLEdBQVEsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUUsQ0FBQztRQUMzQyxJQUFJLFFBQVEsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzNDLElBQUksTUFBTSxHQUFLLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDekMsSUFBSSxPQUFPLEdBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDekMsSUFBSSxLQUFLLEdBQU0sQ0FBQyxLQUFLLEVBQUUsVUFBVSxPQUFPLE1BQU0sQ0FBQyxDQUFDO1FBRWhELElBQVMsUUFBUSxJQUFJLE9BQU8sS0FBSyxDQUFDO1lBQzlCLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGlCQUFpQixRQUFRLE1BQU0sQ0FBQyxDQUFDO2FBQ2pELElBQUksTUFBTSxJQUFNLE9BQU8sS0FBSyxDQUFDO1lBQzlCLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGlCQUFpQixNQUFNLE1BQU0sQ0FBQyxDQUFDOztZQUVoRCxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXJCLE9BQU8sS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFFTyxZQUFZO1FBRWhCLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU5QyxPQUFPLENBQUMsR0FBRyxFQUFFLFNBQVMsS0FBSyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVPLGVBQWUsQ0FBQyxHQUFXO1FBRS9CLElBQUksUUFBUSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQ2xDLElBQUksT0FBTyxHQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkMsSUFBSSxNQUFNLEdBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pELElBQUksTUFBTSxHQUFLLENBQUMsSUFBSSxFQUFFLFVBQVUsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBRW5FLElBQUksT0FBTyxLQUFLLEtBQUs7WUFDakIsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVyQixPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRU8sY0FBYyxDQUFDLE9BQW9CO1FBRXZDLElBQUksR0FBRyxHQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFFLENBQUM7UUFDMUMsSUFBSSxPQUFPLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBRSxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBRSxDQUFDO1FBQzVELElBQUksTUFBTSxHQUFJLEVBQUUsQ0FBQztRQUVqQiw0REFBNEQ7UUFDNUQsSUFBSSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssUUFBUTtZQUM5QyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXRCLE9BQU8sQ0FBQyxHQUFHLE1BQU0sRUFBRSxXQUFXLE9BQU8sTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFTyxjQUFjLENBQUMsT0FBb0IsRUFBRSxHQUFXO1FBRXBELElBQUksR0FBRyxHQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFFLENBQUM7UUFDMUMsSUFBSSxPQUFPLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsSUFBSSxNQUFNLEdBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbEQsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0QyxJQUFJLE1BQU0sR0FBSSxDQUFDLEdBQUcsRUFBRSxXQUFXLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBRXBELElBQUksT0FBTyxLQUFLLEtBQUs7WUFDakIsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVyQixPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRU8sa0JBQWtCLENBQUMsT0FBb0IsRUFBRSxHQUFXO1FBRXhELElBQUksR0FBRyxHQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFFLENBQUM7UUFDMUMsSUFBSSxJQUFJLEdBQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUMsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUV0QyxJQUFJLEtBQUssR0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRTdCLElBQUksQ0FBQyxPQUFPLENBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFFdEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFOUMsbUNBQW1DO1lBQ25DLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUN6QjtnQkFDSSxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsTUFBTSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQzFDLE9BQU87YUFDVjtZQUVELGdFQUFnRTtZQUNoRSxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQztnQkFDZixLQUFLLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLElBQUksQ0FBQyxDQUFDO1lBRTlDLHFEQUFxRDtZQUNyRCxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLEdBQUcsS0FBSyxTQUFTLEVBQzFDO2dCQUNJLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxNQUFNLE1BQU0sQ0FBQyxDQUFDO2dCQUNwQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO2FBQzdDOztnQkFFRyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsTUFBTSxJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDbkQsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVPLFdBQVcsQ0FBQyxPQUFvQjtRQUVwQyxJQUFJLEdBQUcsR0FBSyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBRSxDQUFDO1FBQ3hDLElBQUksSUFBSSxHQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUU5QyxJQUFJLEtBQUssR0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRTdCLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSTtZQUNwQyxPQUFPLENBQUMsR0FBRyxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFOUMsUUFBUTtRQUNSLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXRDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUk7WUFDaEIsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsb0JBQW9CLENBQUMsQ0FBQzs7WUFFeEMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBVSxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTdDLE9BQU8sQ0FBQyxHQUFHLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRU8sVUFBVSxDQUFDLE9BQW9CO1FBRW5DLElBQUksSUFBSSxHQUFLLE9BQU8sQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdEMsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBRWhCLElBQUssSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUM7WUFDckIsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV0QixNQUFNLENBQUMsSUFBSSxDQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFFLENBQUUsQ0FBQztRQUV2QyxJQUFLLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDO1lBQ25CLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFdEIsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztDQUNKO0FDM1VELHFFQUFxRTtBQUVyRSxvRUFBb0U7QUFDcEUsTUFBTSxNQUFNO0lBNkJSO1FBeEJBLHNEQUFzRDtRQUM5QyxrQkFBYSxHQUFzQyxFQUFFLENBQUM7UUFLOUQseURBQXlEO1FBQ2pELGNBQVMsR0FBZ0IsQ0FBQyxDQUFDO1FBbUIvQiw0REFBNEQ7UUFDNUQsdURBQXVEO1FBQ3ZELE1BQU0sQ0FBQyxjQUFjO1lBQ3JCLE1BQU0sQ0FBQyxRQUFRO2dCQUNmLE1BQU0sQ0FBQyxVQUFVO29CQUNqQixNQUFNLENBQUMsVUFBVSxHQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTdDLFFBQVEsQ0FBQyxrQkFBa0IsR0FBYyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVFLE1BQU0sQ0FBQyxlQUFlLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXpFLGdGQUFnRjtRQUNoRixpREFBaUQ7UUFDakQsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBRXZCLDJFQUEyRTtRQUMzRSxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBRWhDLElBQVk7WUFBRSxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7U0FBRTtRQUNqRCxPQUFPLEdBQUcsRUFBRTtZQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsOEJBQThCLEVBQUUsR0FBRyxDQUFDLENBQUM7U0FBRTtJQUN2RSxDQUFDO0lBcENELHNEQUFzRDtJQUN0RCxJQUFXLFVBQVU7UUFFakIsSUFBSSxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVTtZQUMzQyxPQUFPLElBQUksQ0FBQzs7WUFFWixPQUFPLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDO0lBQy9DLENBQUM7SUFFRCxvREFBb0Q7SUFDcEQsSUFBVyxZQUFZO1FBRW5CLE9BQU8sSUFBSSxDQUFDLFNBQVMsS0FBSyxTQUFTLENBQUM7SUFDeEMsQ0FBQztJQXlCRCxrREFBa0Q7SUFDM0MsS0FBSyxDQUFDLE1BQW1CLEVBQUUsV0FBMkIsRUFBRTtRQUUzRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFWixhQUFhO1FBQ2IsSUFBVSxJQUFJLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO1lBQ3RFLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXBDLGdDQUFnQzthQUMzQixJQUFJLE1BQU0sQ0FBQyxlQUFlO1lBQzNCLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXhDLCtDQUErQzthQUMxQyxJQUFJLElBQUksQ0FBQyxNQUFNO1lBQ2hCLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRUQsMENBQTBDO0lBQ25DLElBQUk7UUFFUCxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVU7WUFDaEIsT0FBTztRQUVYLElBQUksTUFBTSxDQUFDLGVBQWU7WUFDdEIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUVwQyxJQUFJLElBQUksQ0FBQyxTQUFTO1lBQ2QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUUxQixJQUFJLElBQUksQ0FBQyxNQUFNO1lBQ1gsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxpRUFBaUU7SUFDekQsa0JBQWtCO1FBRXRCLHVDQUF1QztRQUN2QyxJQUFJLE1BQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEtBQUssUUFBUSxDQUFDLENBQUM7UUFFckQsSUFBSSxNQUFNO1lBQUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsQ0FBQzs7WUFDL0IsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNoRCxDQUFDO0lBRUQsMEVBQTBFO0lBQ2xFLGVBQWU7UUFFbkIsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7UUFFeEIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNwRixDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSyxZQUFZLENBQUMsTUFBbUIsRUFBRSxRQUF3QjtRQUU5RCxJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ25FLElBQUksS0FBSyxHQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFOUMsd0RBQXdEO1FBQ3hELElBQUksQ0FBQyxLQUFLLEVBQ1Y7WUFDSSxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvQyxLQUFLLEdBQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUN6QztRQUVELGlGQUFpRjtRQUNqRix3REFBd0Q7UUFDeEQsSUFBSSxJQUFJLEdBQUksR0FBRyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzlDLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFaEMsS0FBSyxDQUFDLE9BQU8sQ0FBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUUsRUFBRTtZQUU1Qix1RUFBdUU7WUFDdkUsSUFBSSxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDO2dCQUN0QixPQUFPLElBQUksR0FBRyxDQUFDO1lBRW5CLElBQUksU0FBUyxHQUFHLElBQUksd0JBQXdCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFdEQsU0FBUyxDQUFDLEtBQUssR0FBSSxLQUFLLENBQUM7WUFDekIsU0FBUyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ2pFLFNBQVMsQ0FBQyxLQUFLLEdBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNuRSxTQUFTLENBQUMsSUFBSSxHQUFLLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFbEUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUMsQ0FBQyxDQUFDLENBQUM7UUFFSCwyRUFBMkU7UUFDM0UsSUFBSSxJQUFJLENBQUMsT0FBTztZQUNaLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUVuQiw2RUFBNkU7UUFDN0UsOEVBQThFO1FBQzlFLDRFQUE0RTtRQUM1RSxhQUFhLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTlCLElBQUksQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsRUFBRTtZQUU5QixJQUFJLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUTtnQkFDL0IsT0FBTztZQUVYLGFBQWEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFOUIsSUFBSSxJQUFJLENBQUMsTUFBTTtnQkFDWCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDdEIsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ1osQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNLLFFBQVEsQ0FBQyxNQUFtQixFQUFFLFFBQXdCO1FBRTFELElBQUksUUFBUSxHQUFHLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BDLElBQUksT0FBTyxHQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDO1FBRTlELElBQUksQ0FBQyxTQUFVLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRTtZQUUzQixJQUFJLElBQUksQ0FBQyxPQUFPO2dCQUNaLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN2QixDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsU0FBVSxDQUFDLE1BQU0sR0FBRyxHQUFHLEVBQUU7WUFFMUIsSUFBSSxDQUFDLFNBQVUsQ0FBQyxPQUFPLEdBQUcsU0FBUyxDQUFDO1lBQ3BDLElBQUksQ0FBQyxTQUFVLENBQUMsTUFBTSxHQUFJLFNBQVMsQ0FBQztZQUVwQyxJQUFJLElBQUksQ0FBQyxNQUFNO2dCQUNYLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN0QixDQUFDLENBQUM7UUFFRix5RUFBeUU7UUFDekUsUUFBUSxDQUFDLE9BQU8sR0FBSyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBSSxPQUFPLENBQUMsQ0FBQztRQUN6RCxRQUFRLENBQUMsU0FBUyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDdEUsUUFBUSxDQUFDLFFBQVEsR0FBSSxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3JFLFFBQVEsQ0FBQyxNQUFNLEdBQU0sTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUssR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN0RSxRQUFRLENBQUMsSUFBSSxHQUFRLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFdkUsSUFBSSxDQUFDLFNBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3RELENBQUM7Q0FDSjtBQzNNRCxxRUFBcUU7QUNBckUscUVBQXFFO0FBSXJFLGlGQUFpRjtBQUNqRixNQUFNLFNBQVM7SUErQ1gsWUFBbUIsV0FBbUIsVUFBVTtRQUU1QywrQkFBK0I7UUFqQ25DOzs7V0FHRztRQUNjLGFBQVEsR0FBK0IsRUFBRSxDQUFDO1FBUTNELDREQUE0RDtRQUNwRCxlQUFVLEdBQXdCLEtBQUssQ0FBQztRQUNoRCxrRUFBa0U7UUFDMUQsa0JBQWEsR0FBcUIsS0FBSyxDQUFDO1FBQ2hELGtEQUFrRDtRQUMxQyxjQUFTLEdBQXlCLENBQUMsQ0FBQztRQUM1Qyx1RUFBdUU7UUFDL0QsY0FBUyxHQUF5QixDQUFDLENBQUM7UUFDNUMsZ0VBQWdFO1FBQ3hELGdCQUFXLEdBQXVCLEVBQUUsQ0FBQztRQUM3QyxzREFBc0Q7UUFDOUMscUJBQWdCLEdBQTZCLEVBQUUsQ0FBQztRQVlwRCxnRUFBZ0U7UUFDaEUsSUFBSSxZQUFZLEdBQUksTUFBTSxDQUFDLFlBQVksSUFBSSxNQUFNLENBQUMsa0JBQWtCLENBQUM7UUFDckUsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLFlBQVksRUFBRSxDQUFDO1FBRXZDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWTtZQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFFbkQsY0FBYztRQUVkLElBQUksQ0FBQyxRQUFRLEdBQUssUUFBUSxDQUFDO1FBQzNCLElBQUksQ0FBQyxRQUFRLEdBQUssSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqRCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUV6RCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksR0FBUSxVQUFVLENBQUM7UUFDdkMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFLLEdBQUcsQ0FBQztRQUVoQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdkMsbURBQW1EO0lBQ3ZELENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLEtBQUssQ0FBQyxHQUFhLEVBQUUsUUFBd0I7UUFFaEQsT0FBTyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTNDLFlBQVk7UUFFWixJQUFJLElBQUksQ0FBQyxVQUFVO1lBQ2YsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRWhCLElBQUksQ0FBQyxVQUFVLEdBQVEsSUFBSSxDQUFDO1FBQzVCLElBQUksQ0FBQyxhQUFhLEdBQUssS0FBSyxDQUFDO1FBQzdCLElBQUksQ0FBQyxVQUFVLEdBQVEsR0FBRyxDQUFDO1FBQzNCLElBQUksQ0FBQyxlQUFlLEdBQUcsUUFBUSxDQUFDO1FBRWhDLGFBQWE7UUFFYixJQUFLLE9BQU8sQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztZQUMxQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7YUFFckI7WUFDSSxJQUFJLElBQUksR0FBSyxRQUFRLENBQUMsU0FBVSxDQUFDO1lBQ2pDLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakMsSUFBSSxDQUFDLE1BQU0sRUFDWDtnQkFDSSxvRUFBb0U7Z0JBQ3BFLG9FQUFvRTtnQkFDcEUsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUVqQixLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksRUFBRSxDQUFDO3FCQUM1QixJQUFJLENBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUU7cUJBQ2hDLElBQUksQ0FBRSxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxHQUFHLENBQUMsQ0FBRTtxQkFDcEQsSUFBSSxDQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUUsQ0FBQzthQUNwRDs7Z0JBRUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUM5QjtRQUVELGFBQWE7UUFFYixJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV4Qyx1Q0FBdUM7UUFDdkMsSUFBSSxNQUFNLEdBQUcsQ0FBQztZQUNWLE1BQU0sR0FBRyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFL0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQztRQUVsQywwQ0FBMEM7UUFFMUMsSUFBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUM5QztZQUNJLElBQUksSUFBSSxHQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsUUFBUyxFQUFFLENBQUM7WUFDekQsSUFBSSxHQUFHLEdBQVMsSUFBSSxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDM0QsR0FBRyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUM7WUFFbEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDM0IsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUNwQjtRQUVELHdFQUF3RTtRQUV4RSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxLQUFLLFdBQVc7WUFDdkMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFFLENBQUM7O1lBRXJELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNwQixDQUFDO0lBRUQsaUVBQWlFO0lBQzFELElBQUk7UUFFUCxtQ0FBbUM7UUFDbkMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVO1lBQ2hCLE9BQU87UUFFWCxlQUFlO1FBQ2YsWUFBWSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUU3QixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUV4Qiw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUUsQ0FBQztRQUU1QyxrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUVqQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDWixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDdEIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsU0FBUyxHQUFVLENBQUMsQ0FBQztRQUMxQixJQUFJLENBQUMsVUFBVSxHQUFTLFNBQVMsQ0FBQztRQUNsQyxJQUFJLENBQUMsZUFBZSxHQUFJLFNBQVMsQ0FBQztRQUNsQyxJQUFJLENBQUMsV0FBVyxHQUFRLEVBQUUsQ0FBQztRQUMzQixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO1FBRTNCLE9BQU8sQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFN0IsSUFBSSxJQUFJLENBQUMsTUFBTTtZQUNYLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssSUFBSTtRQUVSLDZDQUE2QztRQUM3QyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZTtZQUM3RCxPQUFPO1FBRVgsMEVBQTBFO1FBQzFFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVoQixzREFBc0Q7UUFDdEQsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBRWxCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sR0FBRyxFQUFFLEVBQ3pEO1lBQ0ksSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUcsQ0FBQztZQUVuQyx1RUFBdUU7WUFDdkUseURBQXlEO1lBQ3pELElBQUksT0FBTyxHQUFHLEtBQUssUUFBUSxFQUMzQjtnQkFDSSxTQUFTLElBQUksR0FBRyxDQUFDO2dCQUNqQixTQUFTO2FBQ1o7WUFFRCxJQUFJLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxJQUFJLEdBQUcsTUFBTSxDQUFDO1lBRXhELElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFFLElBQUksVUFBVSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFFLENBQUM7WUFDNUUsU0FBUyxHQUFHLENBQUMsQ0FBQztTQUNqQjtRQUVELHFFQUFxRTtRQUNyRSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxJQUFVLENBQUM7WUFDckMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sSUFBUyxDQUFDO2dCQUNyQyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLElBQUksQ0FBQztvQkFDakMsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFdkIsSUFBSSxDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVPLFFBQVE7UUFFWixtREFBbUQ7UUFDbkQsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU07WUFDbkQsT0FBTztRQUVYLHNFQUFzRTtRQUN0RSxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQztZQUNoQyxPQUFPO1FBRVgsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUcsQ0FBQztRQUVwQyw0REFBNEQ7UUFDNUQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQ2Y7WUFDSSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzQyxPQUFPLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztTQUMxQjtRQUVELHdFQUF3RTtRQUN4RSxJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssQ0FBQztZQUNwQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDO1FBRW5ELE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFL0UsOENBQThDO1FBQzlDLElBQUksT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQzdELElBQUksSUFBSSxHQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUNyRCxJQUFJLElBQUksR0FBTSxHQUFHLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxlQUFnQixDQUFDLElBQUksSUFBSSxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO1FBRXpCLHVDQUF1QztRQUN2QyxJQUFTLElBQUksR0FBRyxDQUFDO1lBQUUsSUFBSSxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQzthQUN4QyxJQUFJLElBQUksR0FBRyxDQUFDO1lBQUUsSUFBSSxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUU3QyxzREFBc0Q7UUFDdEQsSUFBSSxLQUFLLEdBQU0sR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztRQUN0QyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztRQUVqRCxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDL0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxDQUFDO1FBRW5DLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLEdBQUcsT0FBTyxDQUFDLENBQUM7UUFFL0MsNEJBQTRCO1FBQzVCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUN2QjtZQUNJLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1lBRTFCLElBQUksSUFBSSxDQUFDLE9BQU87Z0JBQ1osSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1NBQ3RCO1FBRUQsa0VBQWtFO1FBQ2xFLElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLEVBQUU7WUFFZixPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QyxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRTlDLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQztnQkFDVixJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxDQUFDLENBQUM7SUFDTixDQUFDO0lBRU8sWUFBWSxDQUFDLElBQVksRUFBRSxPQUFvQjtRQUVuRCxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFhLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDcEUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEdBQU0sT0FBTyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztRQUNyQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNwQyxPQUFPLENBQUMsS0FBSyxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFTyxTQUFTLENBQUMsTUFBc0I7UUFFcEMsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUN0QjtZQUNJLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLGFBQWEsR0FBRyxTQUFTLENBQUM7U0FDbEM7UUFFRCxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBRTdCLElBQUksTUFBTSxFQUNWO1lBQ0ksSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUM7WUFDNUIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDaEMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1NBQ2pEOztZQUVHLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDL0QsQ0FBQzs7QUF6VEQsbURBQW1EO0FBQzVCLGlCQUFPLEdBQXdCO0lBQ2xELEVBQUUsRUFBdUIsTUFBTTtJQUMvQixpQkFBaUIsRUFBUSxzQ0FBc0M7SUFDL0Qsc0JBQXNCLEVBQUcsb0NBQW9DO0lBQzdELHNCQUFzQixFQUFHLHNDQUFzQztDQUNsRSxDQUFDO0FDYk4scUVBQXFFO0FBRXJFLHlFQUF5RTtBQUN6RSxNQUFNLFVBQVU7SUFrQlosWUFBbUIsSUFBWSxFQUFFLEtBQWEsRUFBRSxPQUFxQjtRQVByRSwyRUFBMkU7UUFDcEUsV0FBTSxHQUFpQixLQUFLLENBQUM7UUFRaEMsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLElBQUksR0FBTSxJQUFJLENBQUM7UUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBSyxLQUFLLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssR0FBSyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRXJDLG9FQUFvRTtRQUNwRSxLQUFLLENBQUMsSUFBSSxFQUFFLEVBQUUsTUFBTSxFQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7YUFDdEMsSUFBSSxDQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFFO2FBQ2xDLEtBQUssQ0FBRSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBSSxDQUFDO1FBRXhDLG9DQUFvQztRQUNwQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQsdURBQXVEO0lBQ2hELE1BQU07UUFFVCxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxrRUFBa0U7SUFDMUQsU0FBUyxDQUFDLEdBQWE7UUFFM0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ1AsTUFBTSxLQUFLLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxNQUFNLE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFFL0QsR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBRSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBRSxDQUFDO0lBQzVELENBQUM7SUFFRCxxRUFBcUU7SUFDN0QsYUFBYSxDQUFDLE1BQW1CO1FBRXJDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUM7YUFDOUIsSUFBSSxDQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFFO2FBQ2pDLEtBQUssQ0FBRSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBRyxDQUFDO0lBQzNDLENBQUM7SUFFRCw2REFBNkQ7SUFDckQsUUFBUSxDQUFDLE1BQW1CO1FBRWhDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxnREFBZ0Q7SUFDeEMsT0FBTyxDQUFDLEdBQVE7UUFFcEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7SUFDdkIsQ0FBQztDQUNKO0FDMUVELHFFQUFxRTtBQUVyRSxzQ0FBc0M7QUFDdEMsOERBQThEO0FBQzlELE1BQWUsUUFBUTtJQUtuQixtRkFBbUY7SUFDbkYsWUFBc0IsUUFBOEI7UUFFaEQsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRO1lBQzVCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQzs7WUFFakMsSUFBSSxDQUFDLEdBQUcsR0FBRyxRQUFRLENBQUM7SUFDNUIsQ0FBQztJQUVELDhEQUE4RDtJQUNwRCxNQUFNLENBQXdCLEtBQWE7UUFFakQsT0FBTyxHQUFHLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDeEMsQ0FBQztDQUNKO0FDdkJELHFFQUFxRTtBQUVyRSxrQ0FBa0M7QUFFbEMsMkNBQTJDO0FBQzNDLE1BQU0sVUFBVyxTQUFRLFFBQVE7SUFRN0I7UUFFSSxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQVIvQix5Q0FBeUM7UUFDeEIsZUFBVSxHQUF1QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBUTdFLENBQUM7SUFFRCxnREFBZ0Q7SUFDekMsUUFBUTtRQUVYLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxjQUFjO1lBQ3pCLE9BQU87UUFFWCxJQUFJLENBQUMsVUFBVSxHQUFXLFFBQVEsQ0FBQyxhQUE0QixDQUFDO1FBQ2hFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBSyxJQUFJLENBQUM7UUFDL0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQVcsS0FBSyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDNUIsQ0FBQztJQUVELHFFQUFxRTtJQUM3RCxTQUFTO1FBRWIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFhLElBQUksQ0FBQztRQUNqQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQU8sS0FBSyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxHQUFLLElBQUksQ0FBQztRQUNqQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRWxCLElBQUksSUFBSSxDQUFDLFVBQVUsRUFDbkI7WUFDSSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO1NBQy9CO0lBQ0wsQ0FBQztDQUNKO0FDOUNELHFFQUFxRTtBQUVyRSx1Q0FBdUM7QUFDdkMsTUFBTSxNQUFNO0lBV1I7UUFFSSxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFbEMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEQsTUFBTSxDQUFDLFFBQVEsR0FBUyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsR0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsR0FBSSxDQUFDLENBQUMsV0FBVyxDQUFDO0lBQzFDLENBQUM7SUFFRCxvRkFBb0Y7SUFDN0UsUUFBUTtRQUVYLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxHQUFHLDBCQUEwQixDQUFDO1FBRWhELEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5QixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFFdEIsMkNBQTJDO1FBQzNDLElBQUksT0FBTyxHQUFTLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkQsT0FBTyxDQUFDLFNBQVMsR0FBRyxlQUFlLENBQUM7UUFFcEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVELHNGQUFzRjtJQUMvRSxnQkFBZ0IsQ0FBQyxHQUFXO1FBRS9CLDhFQUE4RTtRQUM5RSw2RUFBNkU7UUFDN0UsNkNBQTZDO1FBRTdDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsc0NBQXNDLEdBQUcsR0FBRyxDQUFDO2FBQ2xFLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUVULElBQUksT0FBTyxHQUFNLENBQWdCLENBQUM7WUFDbEMsSUFBSSxVQUFVLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNyRCxJQUFJLE1BQU0sR0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRTNDLFVBQVUsQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRXBDLElBQUksTUFBTTtnQkFDTixVQUFVLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUU5QyxPQUFPLENBQUMsYUFBYyxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDekQsR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLGFBQWMsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUMxQixDQUFDLENBQUMsQ0FBQztJQUNYLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLGtCQUFrQixDQUFDLEtBQWE7UUFFbkMsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sS0FBSyxFQUFFLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsaURBQWlEO0lBQzFDLFNBQVM7UUFFWixPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWdDLENBQUM7SUFDckQsQ0FBQztJQUVELGdGQUFnRjtJQUN6RSxPQUFPO1FBRVYsT0FBTyxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLGVBQWUsQ0FBQyxJQUFZLEVBQUUsS0FBYTtRQUU5QyxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxJQUFJLEdBQUcsQ0FBQzthQUN6QyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFRCwrQ0FBK0M7SUFDeEMsV0FBVztRQUVkLElBQUksSUFBSSxDQUFDLGFBQWE7WUFDbEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUUvQixJQUFJLElBQUksQ0FBQyxVQUFVLEVBQ25CO1lBQ0ksSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDM0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztTQUN0RDtRQUVELElBQUksQ0FBQyxhQUFhLEdBQUcsU0FBUyxDQUFDO1FBQy9CLElBQUksQ0FBQyxVQUFVLEdBQU0sU0FBUyxDQUFDO0lBQ25DLENBQUM7SUFFRCxtRUFBbUU7SUFDM0QsY0FBYztRQUVsQixJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLHVCQUF1QixDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQzlELGVBQWUsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQ3hDLENBQUM7UUFFRixJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUV0RCxjQUFjLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBbUIsQ0FBQyxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELHNFQUFzRTtJQUM5RCxPQUFPLENBQUMsRUFBYztRQUUxQixJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUMsTUFBcUIsQ0FBQztRQUN0QyxJQUFJLElBQUksR0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUM1RCxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFNUQsSUFBSSxDQUFDLE1BQU07WUFDUCxPQUFPLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUU5QixrQ0FBa0M7UUFDbEMsSUFBSyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7WUFDbkMsT0FBTztRQUVYLHlEQUF5RDtRQUN6RCxJQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQ2hDLE9BQU87UUFFWCx1REFBdUQ7UUFDdkQsSUFBSyxJQUFJLENBQUMsYUFBYTtZQUN2QixJQUFLLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7Z0JBQ3hDLE9BQU87UUFFWCwwQkFBMEI7UUFDMUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUNqQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFFbkIsNkRBQTZEO1FBQzdELElBQUksSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLEtBQUssV0FBVztZQUN6QyxPQUFPO1FBRVgsNkRBQTZEO1FBQzdELElBQUksTUFBTSxLQUFLLFVBQVU7WUFDckIsT0FBTztRQUVYLElBQUksTUFBTSxHQUFTLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFzQixDQUFDO1FBQ2xFLElBQUksWUFBWSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFnQixDQUFDO1FBRWxFLDhCQUE4QjtRQUM5QixJQUFJLE1BQU07WUFDTixJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEMscUNBQXFDO2FBQ2hDLElBQUksWUFBWSxFQUNyQjtZQUNJLHFCQUFxQjtZQUNyQixNQUFNLEdBQUcsWUFBWSxDQUFDLGFBQWMsQ0FBQztZQUNyQyxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUUsQ0FBQyxDQUFDO1lBQ3RELElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1NBQ25DO1FBRUQsOENBQThDO2FBQ3pDLElBQUksSUFBSSxJQUFJLE1BQU07WUFDbkIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELG9EQUFvRDtJQUM1QyxRQUFRLENBQUMsQ0FBUTtRQUVyQixJQUFJLElBQUksQ0FBQyxhQUFhO1lBQ2xCLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVELG9EQUFvRDtJQUM1QyxRQUFRLENBQUMsQ0FBUTtRQUVyQixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWE7WUFDbkIsT0FBTztRQUVYLGlFQUFpRTtRQUNqRSxJQUFJLEdBQUcsQ0FBQyxRQUFRO1lBQ2hCLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUU7Z0JBQzdCLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUVyQixJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNLLGtCQUFrQixDQUFDLE1BQW1CO1FBRTFDLElBQUksTUFBTSxHQUFPLE1BQU0sQ0FBQyxhQUFjLENBQUM7UUFDdkMsSUFBSSxHQUFHLEdBQVUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEQsSUFBSSxJQUFJLEdBQVMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDakQsSUFBSSxVQUFVLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUVsRCxtRUFBbUU7UUFDbkUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FDckIsa0JBQWtCLElBQUksY0FBYyxHQUFHLGdCQUFnQixDQUMxRCxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUVULFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBbUIsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ25ELGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBbUIsQ0FBQyxDQUFDO1lBQzNDLHFFQUFxRTtZQUNyRSw0Q0FBNEM7WUFDNUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7SUFDWCxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSyxVQUFVLENBQUMsTUFBbUIsRUFBRSxNQUFjO1FBRWxELE1BQU0sQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRXZDLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDO1FBQzVCLElBQUksQ0FBQyxVQUFVLEdBQU0sTUFBTSxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDeEIsQ0FBQztDQUNKO0FDdFBELHFFQUFxRTtBQUVyRSwyQ0FBMkM7QUFDM0MsTUFBTSxPQUFPO0lBWVQ7UUFMQSxxREFBcUQ7UUFDN0MsVUFBSyxHQUFhLENBQUMsQ0FBQztRQUM1QiwwREFBMEQ7UUFDbEQsV0FBTSxHQUFZLENBQUMsQ0FBQztRQUl4QixJQUFJLENBQUMsR0FBRyxHQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTlDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVELHlFQUF5RTtJQUNsRSxHQUFHLENBQUMsR0FBVyxFQUFFLFVBQW1CLElBQUk7UUFFM0MsTUFBTSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV4QyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsR0FBTyxHQUFHLENBQUM7UUFDbkMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUVsQyxJQUFJLENBQUMsT0FBTztZQUFFLE9BQU87UUFFckIsMkVBQTJFO1FBQzNFLDJDQUEyQztRQUMzQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDO1FBQ25DLElBQUksS0FBSyxHQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDO1FBQzlDLElBQUksSUFBSSxHQUFNLEdBQUcsRUFBRTtZQUVmLElBQUksQ0FBQyxNQUFNLElBQXFCLENBQUMsQ0FBQztZQUNsQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUksY0FBYyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUM7WUFFL0QsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUs7Z0JBQ25CLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7O2dCQUVsQyxJQUFJLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4RCxDQUFDLENBQUM7UUFFRixNQUFNLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVELDBDQUEwQztJQUNuQyxJQUFJO1FBRVAsTUFBTSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQ3RDLENBQUM7Q0FDSjtBQzFERCxxRUFBcUU7QUFFckUsa0NBQWtDO0FBRWxDLHlDQUF5QztBQUN6QyxNQUFNLFFBQVMsU0FBUSxRQUFRO0lBZ0MzQjtRQUVJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBaENaLGFBQVEsR0FDckIsSUFBSSxDQUFDLE1BQU0sQ0FBc0IsbUJBQW1CLENBQUMsQ0FBQztRQUN6QyxZQUFPLEdBQ3BCLElBQUksQ0FBQyxNQUFNLENBQXNCLGtCQUFrQixDQUFDLENBQUM7UUFDeEMsY0FBUyxHQUN0QixJQUFJLENBQUMsTUFBTSxDQUFzQixZQUFZLENBQUMsQ0FBQztRQUNsQyxlQUFVLEdBQ3ZCLElBQUksQ0FBQyxNQUFNLENBQXNCLGFBQWEsQ0FBQyxDQUFDO1FBQ25DLGdCQUFXLEdBQ3hCLElBQUksQ0FBQyxNQUFNLENBQXNCLGNBQWMsQ0FBQyxDQUFDO1FBQ3BDLGlCQUFZLEdBQ3pCLElBQUksQ0FBQyxNQUFNLENBQXNCLGVBQWUsQ0FBQyxDQUFDO1FBQ3JDLGlCQUFZLEdBQ3pCLElBQUksQ0FBQyxNQUFNLENBQXNCLGVBQWUsQ0FBQyxDQUFDO1FBQ3JDLGdCQUFXLEdBQ3hCLElBQUksQ0FBQyxNQUFNLENBQXNCLGNBQWMsQ0FBQyxDQUFDO1FBQ3BDLG1CQUFjLEdBQzNCLElBQUksQ0FBQyxNQUFNLENBQXNCLGtCQUFrQixDQUFDLENBQUM7UUFDeEMsbUJBQWMsR0FDM0IsSUFBSSxDQUFDLE1BQU0sQ0FBc0IsaUJBQWlCLENBQUMsQ0FBQztRQUN2QyxxQkFBZ0IsR0FDN0IsSUFBSSxDQUFDLE1BQU0sQ0FBc0IsbUJBQW1CLENBQUMsQ0FBQztRQUN6QyxvQkFBZSxHQUM1QixJQUFJLENBQUMsTUFBTSxDQUFzQixrQkFBa0IsQ0FBQyxDQUFDO1FBQ3hDLGtCQUFhLEdBQzFCLElBQUksQ0FBQyxNQUFNLENBQXNCLGdCQUFnQixDQUFDLENBQUM7UUFRbkQsa0RBQWtEO1FBRWxELElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxHQUFRLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxHQUFTLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hELElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxHQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTdELDBDQUEwQztRQUMxQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRXpFLDhDQUE4QztRQUM5QyxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsZ0NBQWdDO0lBQ3pCLElBQUk7UUFFUCxtRUFBbUU7UUFDbkUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFFekIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUM1QjtZQUNJLGtCQUFrQjtZQUNsQixJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBTSxLQUFLLENBQUM7WUFDbEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUssSUFBSSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxHQUFHLDZDQUE2QztnQkFDckUsd0VBQXdFO2dCQUN4RSx3QkFBd0IsQ0FBQztTQUNoQzs7WUFFRyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQztRQUVuRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssR0FBZ0IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDekQsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQWUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUM7UUFDL0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQWUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDM0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQWdCLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQzFELElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxHQUFhLEdBQUcsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDO1FBQzdELElBQUksQ0FBQyxjQUFjLENBQUMsYUFBYSxHQUFLLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQzNELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUM7UUFDN0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxhQUFhLEdBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7UUFFNUQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQVMsS0FBSyxDQUFDO1FBQzlCLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFDN0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUN6QixDQUFDO0lBRUQsaUNBQWlDO0lBQzFCLEtBQUs7UUFFUixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQixHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQzlCLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFTLElBQUksQ0FBQztRQUM3QixHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDeEMsQ0FBQztJQUVELG1FQUFtRTtJQUMzRCxNQUFNO1FBRVYsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7UUFDeEMsSUFBSSxTQUFTLEdBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssS0FBSyxFQUFFLENBQUMsQ0FBQztRQUVqRCxHQUFHLENBQUMsZUFBZSxDQUNmLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUNwQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLFVBQVUsQ0FBQyxFQUNwQyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQVEsVUFBVSxDQUFDLEVBQ3BDLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBTyxVQUFVLElBQUksU0FBUyxDQUFDLEVBQ2pELENBQUMsSUFBSSxDQUFDLFlBQVksRUFBTyxVQUFVLENBQUMsRUFDcEMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFRLFVBQVUsQ0FBQyxDQUN2QyxDQUFDO0lBQ04sQ0FBQztJQUVELDBDQUEwQztJQUNsQyxpQkFBaUI7UUFFckIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBRW5DLElBQUksTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDO1FBRXRDLG9CQUFvQjtRQUNwQixJQUFJLE1BQU0sS0FBSyxFQUFFLEVBQ2pCO1lBQ0ksSUFBSSxNQUFNLEdBQVEsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN4RSxNQUFNLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztTQUMxQjtRQUNELG1FQUFtRTs7WUFDOUQsS0FBSyxJQUFJLElBQUksSUFBSSxNQUFNO2dCQUN4QixHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsR0FBRyxJQUFJLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFFRCxrRkFBa0Y7SUFDMUUsV0FBVztRQUVmLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUN0QjtZQUNJLElBQUksQ0FBQyxZQUFZLEdBQVMsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3pFLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQztZQUM3QyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBTyxDQUFDLENBQUMsa0JBQWtCLENBQUM7WUFDL0MsT0FBTztTQUNWO1FBRUQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNuQixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWixLQUFLLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxzRUFBc0U7SUFDOUQsV0FBVztRQUVmLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFDckMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUN2QyxJQUFJLENBQUMsWUFBWSxHQUFTLFNBQVMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsd0RBQXdEO0lBQ2hELFVBQVU7UUFFZCxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQVUsR0FBTSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztRQUNsRCxHQUFHLENBQUMsTUFBTSxDQUFDLE9BQU8sR0FBUyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQztRQUNsRCxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztRQUNuRCxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsR0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztRQUNuRCxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsR0FBUSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQztRQUNsRCxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsR0FBSyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQztRQUNyRCwyREFBMkQ7UUFDM0QsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEdBQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEdBQUssVUFBVSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNuRSxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQVUsR0FBTSxVQUFVLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsRSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNqQixDQUFDO0lBRUQsNkRBQTZEO0lBQ3JELGVBQWUsQ0FBQyxFQUFTO1FBRTdCLEVBQUUsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNwQixHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUVuQyx1RUFBdUU7UUFDdkUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFFbkIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1lBRXBDLElBQUksTUFBTSxHQUFTLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakQsTUFBTSxDQUFDLFNBQVMsR0FBRyx3QkFBd0IsQ0FBQztZQUU1QyxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU1QixHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FDWixNQUFNLENBQUMsaUJBQWlDLEVBQ3hDO2dCQUNJLE1BQU0sRUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU87Z0JBQ2xDLE9BQU8sRUFBSyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUs7Z0JBQzdELFNBQVMsRUFBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUs7Z0JBQ25DLFFBQVEsRUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUs7Z0JBQ2xDLFNBQVMsRUFBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUs7Z0JBQ3JDLE1BQU0sRUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLGFBQWE7Z0JBQzdDLEtBQUssRUFBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtnQkFDL0MsSUFBSSxFQUFRLElBQUksQ0FBQyxlQUFlLENBQUMsYUFBYTthQUNqRCxDQUNKLENBQUM7UUFDTixDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDWixDQUFDO0NBQ0o7QUNoTkQscUVBQXFFO0FBRXJFLG1DQUFtQztBQUVuQyx1REFBdUQ7QUFDdkQsTUFBTSxXQUFZLFNBQVEsUUFBUTtJQWM5QjtRQUVJLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUxsQixTQUFJLEdBQW9CLE1BQU0sQ0FBQztRQUMvQixXQUFNLEdBQXNELEVBQUUsQ0FBQztRQU1uRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQW1CLG1CQUFtQixDQUFDLENBQUM7UUFDdEUsSUFBSSxDQUFDLFNBQVMsR0FBSyxJQUFJLENBQUMsTUFBTSxDQUFtQixrQkFBa0IsQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxVQUFVLEdBQUksSUFBSSxDQUFDLE1BQU0sQ0FBYyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ25FLElBQUksQ0FBQyxRQUFRLEdBQU0sSUFBSSxDQUFDLE1BQU0sQ0FBYyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ25FLElBQUksQ0FBQyxTQUFTLEdBQUssSUFBSSxDQUFDLE1BQU0sQ0FBb0IsaUJBQWlCLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsU0FBUyxHQUFLLElBQUksQ0FBQyxNQUFNLENBQW9CLGlCQUFpQixDQUFDLENBQUM7UUFDckUsSUFBSSxDQUFDLFNBQVMsR0FBSyxJQUFJLENBQUMsTUFBTSxDQUFvQixpQkFBaUIsQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxPQUFPLEdBQU8sSUFBSSxDQUFDLE1BQU0sQ0FBbUIsa0JBQWtCLENBQUMsQ0FBQztRQUVyRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV6RCx3Q0FBd0M7UUFDeEMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFTyxVQUFVO1FBQ2QsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDaEQsSUFBSSxHQUFHLEVBQUU7WUFDTCxJQUFJO2dCQUNBLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDO2dCQUNqQixLQUFLLElBQUksR0FBRyxJQUFJLE1BQU0sRUFBRTtvQkFDcEIsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUN0QixJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRTt3QkFDekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQztxQkFDcEU7eUJBQU07d0JBQ0gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7cUJBQ3BDO2lCQUNKO2FBQ0o7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDUixJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQzthQUNwQjtTQUNKO2FBQU07WUFDSCxJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztTQUNwQjtJQUNMLENBQUM7SUFFTyxVQUFVO1FBQ2QsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVNLElBQUksQ0FBQyxJQUFxQjtRQUU3QixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBRTVCLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7WUFDdEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsTUFBTSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxDQUFDLHVCQUF1QjtTQUMxRDthQUFNO1lBQ0gsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsTUFBTSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztTQUNsQztRQUVELElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztRQUU3QixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFFeEIsMERBQTBEO1FBQzFELEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDO1FBRTVDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNuQixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzdCLENBQUM7SUFFTyxXQUFXO1FBQ2YsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBQzVCLElBQUksSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUVoRixJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ25CLElBQUksRUFBRSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdEMsRUFBRSxDQUFDLFNBQVMsR0FBRyxzQkFBc0IsQ0FBQztZQUN0QyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDekIsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzdCLE9BQU87U0FDVjtRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDZixJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2hDLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxJQUFJLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztZQUMzQyxJQUFJLEVBQUUsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3RDLEVBQUUsQ0FBQyxTQUFTLEdBQUcsR0FBRyxHQUFHLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDakMsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ3pCLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztZQUM1QixFQUFFLENBQUMsS0FBSyxDQUFDLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQztZQUV6QyxFQUFFLENBQUMsV0FBVyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsZUFBZSxHQUFHLE1BQU0sQ0FBQztZQUN6RCxFQUFFLENBQUMsVUFBVSxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsZUFBZSxHQUFHLGFBQWEsQ0FBQztZQUUvRCxFQUFFLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRTtnQkFDZCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3hDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN2QixDQUFDLENBQUM7WUFDRixJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTSxLQUFLLENBQUMsRUFBVTtRQUVuQixJQUFJLEVBQUU7WUFBRSxFQUFFLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDNUIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ3ZCLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEdBQUcsRUFBRSxDQUFDO1FBRXhDLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7WUFDdEIsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1NBQ3JDO2FBQU07WUFDSCxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDdkM7SUFDTCxDQUFDO0lBRU8sTUFBTTtRQUNWLElBQUksSUFBSSxHQUFTLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQzNDLElBQUksSUFBSSxHQUFTLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDO1FBQzVDLElBQUksT0FBTyxHQUFNLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUUsR0FBRyxDQUFDLENBQUM7UUFDN0QsSUFBSSxPQUFPLEdBQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBRSxHQUFHLENBQUMsQ0FBQztRQUU3RCxJQUFJLEdBQUcsQ0FBQyxRQUFRLEVBQUU7WUFDZCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDO1NBQ2pDO1FBRUQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFDckMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFJLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFDckMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUNuQyxDQUFDO0lBRU8sZUFBZTtRQUNuQiw4RUFBOEU7SUFDbEYsQ0FBQztJQUVPLFdBQVc7UUFDZixJQUFJLEdBQUcsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFO1lBQ3ZCLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztZQUMvQixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7WUFDN0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1lBQzVCLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztZQUMvQixPQUFPO1NBQ1Y7UUFFRCxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2hDLElBQUksTUFBTSxHQUFHLENBQUMsUUFBUSxLQUFLLFNBQVMsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsTUFBTSxDQUFDO1FBRWhDLElBQUksTUFBTSxFQUFFO1lBQ1IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUNwRTthQUFNO1lBQ0gsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1NBQ2xDO1FBRUQsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRTtZQUN0QixJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7WUFDaEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxNQUFNLENBQUM7WUFDL0IsSUFBSSxNQUFNLEVBQUU7Z0JBQ1IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsd0RBQXdELENBQUM7Z0JBQ25GLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUM7YUFDekM7U0FDSjthQUFNO1lBQ0gsWUFBWTtZQUNaLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLENBQUMsTUFBTSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxDQUFDLGlDQUFpQztZQUNoRSxJQUFJLENBQUMsTUFBTSxFQUFFO2dCQUNULElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLHVCQUF1QixDQUFDO2dCQUNsRCxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDO2FBQ3pDO1NBQ0o7SUFDTCxDQUFDO0lBRU8sZ0JBQWdCLENBQUMsU0FBaUI7UUFDdEMsSUFBSTtZQUNBLElBQUksUUFBUSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUM7WUFDekIsR0FBRyxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxFQUFFLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBVSxDQUFDO1lBRXZFLElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDNUMsT0FBTyxDQUFDLFNBQVMsR0FBRywwQkFBMEIsQ0FBQztZQUMvQyxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUM3QixJQUFJLFlBQVksR0FBRyxHQUFHLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFdEQsR0FBRyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7WUFFckIsT0FBTyxZQUFZLENBQUM7U0FDdkI7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNSLE9BQU8sMkJBQTJCLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztTQUNsRDtJQUNMLENBQUM7SUFFTyxZQUFZLENBQUMsRUFBUztRQUMxQixFQUFFLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDcEIsSUFBSSxHQUFHLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0MsSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7WUFBRSxPQUFPO1FBRWxDLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7WUFDdEIsSUFBSTtnQkFDQSxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO2dCQUN6RCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHO29CQUNmLElBQUksRUFBRSxJQUFJO29CQUNWLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7aUJBQ2xDLENBQUM7Z0JBQ0YsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNsQixHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQy9DLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQzthQUNoQjtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNSLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBRSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBRSxDQUFDO2FBQ3pEO1NBQ0o7YUFBTTtZQUNILElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEMsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksRUFBRTtnQkFDM0IsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3hCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQzthQUNoQjtTQUNKO0lBQ0wsQ0FBQztJQUVPLFlBQVksQ0FBQyxFQUFTO1FBQzFCLEVBQUUsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNwQixJQUFJLEdBQUcsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztZQUFFLE9BQU87UUFFbEMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ2xCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDbEIsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQzlDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbkIsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1NBQ3RCO0lBQ0wsQ0FBQztDQUNKO0FDblFELHFFQUFxRTtBQUVyRSxxQ0FBcUM7QUFDckMsTUFBTSxPQUFPO0lBaUJUO1FBRUksSUFBSSxDQUFDLEdBQUcsR0FBVyxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyxPQUFPLEdBQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsT0FBTyxHQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzlDLElBQUksQ0FBQyxPQUFPLEdBQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsU0FBUyxHQUFLLEdBQUcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLFNBQVMsR0FBSyxHQUFHLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRS9DLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxHQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxHQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzFELElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxHQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFLLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFLLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXhELG9FQUFvRTtRQUNwRSxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQy9CO1lBQ0ksSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDNUI7O1lBRUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUM3QixDQUFDO0lBRUQsK0VBQStFO0lBQ3ZFLFVBQVU7UUFFZCxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUU3QiwrRUFBK0U7UUFDL0UsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQseURBQXlEO0lBQ2pELFdBQVc7UUFFZixJQUFJLFNBQVMsR0FBVyxLQUFLLENBQUM7UUFDOUIsSUFBSSxVQUFVLEdBQVUsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUssSUFBSSxDQUFDO1FBQzdCLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUM5QixJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBSyxLQUFLLENBQUM7UUFFOUIsaUJBQWlCO1FBQ2pCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUUvQywyREFBMkQ7UUFDM0QsSUFBSSxPQUFPLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFFakMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3RCLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdEIsQ0FBQyxFQUFFLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztRQUVkLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRTtZQUV0QixZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEIsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRWxDLFNBQVMsR0FBWSxJQUFJLENBQUM7WUFDMUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEdBQUcsU0FBUyxDQUFDO1FBQ25DLENBQUMsQ0FBQztRQUVGLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRTtZQUVyQixZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEIsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBRWxCLHVFQUF1RTtZQUN2RSxJQUFJLENBQUMsU0FBUyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUN2QztnQkFDSSxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7Z0JBRTlCLGlCQUFpQjtnQkFDakIsS0FBSyxDQUNELDREQUE0RDtvQkFDNUQsOERBQThEO29CQUM5RCw2REFBNkQ7b0JBQzdELGdFQUFnRSxDQUNuRSxDQUFDO2FBQ0w7aUJBQ0ksSUFBSSxDQUFDLFNBQVM7Z0JBQ2YsS0FBSyxDQUNELHlEQUF5RDtvQkFDekQsZ0VBQWdFO29CQUNoRSxnRUFBZ0UsQ0FDbkUsQ0FBQztZQUVOLHFFQUFxRTtZQUNyRSxJQUFJLENBQUMsU0FBUztnQkFDVixHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDO1FBRUYsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUUsQ0FBQztRQUNqRCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxtRUFBbUU7SUFDM0QsVUFBVSxDQUFDLEVBQVU7UUFFekIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEdBQUksU0FBUyxDQUFDO1FBQ2hDLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFLLFNBQVMsQ0FBQztRQUNoQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFFNUIsdUVBQXVFO1FBQ3ZFLHFEQUFxRDtRQUNyRCxJQUFJLFFBQVEsQ0FBQyxhQUFhLEtBQUssSUFBSSxDQUFDLE9BQU87WUFDdkMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUV6QixJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFFM0IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVsQixvREFBb0Q7UUFDcEQsSUFBSSxFQUFFO1lBQ0YsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRCwwRUFBMEU7SUFDbEUsY0FBYztRQUVsQixvREFBb0Q7UUFDcEQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzNDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNmLEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztJQUN0QyxDQUFDO0lBRUQscUVBQXFFO0lBQzdELFVBQVU7UUFFZCxHQUFHLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVELHFFQUFxRTtJQUM3RCxVQUFVO1FBRWQsR0FBRyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCwrREFBK0Q7SUFDdkQsWUFBWTtRQUVoQixHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUM5QixDQUFDO0NBQ0o7QUN0S0QscUVBQXFFO0FBRXJFLDBDQUEwQztBQUMxQyxNQUFNLEtBQUs7SUFtQlA7UUFFSSxJQUFJLENBQUMsSUFBSSxHQUFTLEdBQUcsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyxNQUFNLEdBQU8sSUFBSSxNQUFNLEVBQUUsQ0FBQztRQUMvQixJQUFJLENBQUMsT0FBTyxHQUFNLElBQUksT0FBTyxFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLFFBQVEsR0FBSyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUNyQyxJQUFJLENBQUMsT0FBTyxHQUFNLElBQUksT0FBTyxFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLE9BQU8sR0FBTSxFQUFFLENBQUM7UUFFckI7WUFDSSxJQUFJLFdBQVcsRUFBRTtZQUNqQixJQUFJLFlBQVksRUFBRTtZQUNsQixJQUFJLGFBQWEsRUFBRTtZQUNuQixJQUFJLFdBQVcsRUFBRTtZQUNqQixJQUFJLGVBQWUsRUFBRTtZQUNyQixJQUFJLGNBQWMsRUFBRTtZQUNwQixJQUFJLGFBQWEsRUFBRTtZQUNuQixJQUFJLGFBQWEsRUFBRTtZQUNuQixJQUFJLGlCQUFpQixFQUFFO1lBQ3ZCLElBQUksVUFBVSxFQUFFO1NBQ25CLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUM7UUFFMUQsaUJBQWlCO1FBQ2pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWxELCtCQUErQjtRQUMvQixJQUFJLEdBQUcsQ0FBQyxLQUFLO1lBQ1QsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRCx1REFBdUQ7SUFDaEQsU0FBUyxDQUFDLE1BQWM7UUFFM0IsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRCw4Q0FBOEM7SUFDdEMsT0FBTyxDQUFDLEVBQWlCO1FBRTdCLElBQUksRUFBRSxDQUFDLEdBQUcsS0FBSyxRQUFRO1lBQ25CLE9BQU87UUFFWCxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDMUIsQ0FBQztDQUNKO0FDckVELHFFQUFxRTtBQUVyRSxxRkFBcUY7QUFDckYsb0RBQW9EO0FBRXBELHNFQUFzRTtBQUN0RSxTQUFTLE1BQU0sQ0FBSSxLQUFRO0lBRXZCLElBQUksS0FBSyxLQUFLLFNBQVMsSUFBSSxLQUFLLEtBQUssSUFBSTtRQUNyQyxNQUFNLFdBQVcsQ0FBQyxzQkFBc0IsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUV0RCxPQUFPLEtBQUssQ0FBQztBQUNqQixDQUFDO0FBRUQsMERBQTBEO0FBQzFELFNBQVMsWUFBWSxDQUFDLEtBQWE7SUFFL0IsSUFBSyxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQztRQUMxQyxNQUFNLFdBQVcsQ0FBQyx1QkFBdUIsRUFBRSxZQUFZLENBQUMsQ0FBQztBQUNqRSxDQUFDO0FBRUQsa0ZBQWtGO0FBQ2xGLFNBQVMsV0FBVyxDQUFDLE9BQVksRUFBRSxNQUFnQjtJQUUvQyxJQUFJLEtBQUssR0FBRyxLQUFLLENBQUMscUJBQXFCLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFFbEQsSUFBSSxLQUFLLENBQUMsaUJBQWlCO1FBQ3ZCLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFM0MsT0FBTyxLQUFLLENBQUM7QUFDakIsQ0FBQztBQzlCRCxxRUFBcUU7QUFFckUsNERBQTREO0FBQzVELE1BQU0sWUFBWTtJQUVkOzs7OztPQUtHO0lBQ0ksTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFpQixFQUFFLEtBQWM7UUFFL0MsSUFBSSxLQUFLO1lBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7O1lBQ25DLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDakQsQ0FBQztDQUNKO0FDaEJELHFFQUFxRTtBQUVyRSw4RUFBOEU7QUFDOUUsU0FBUyxNQUFNLENBQUksS0FBb0IsRUFBRSxNQUFTO0lBRTlDLE9BQU8sQ0FBQyxLQUFLLEtBQUssU0FBUyxJQUFJLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDcEUsQ0FBQztBQ05ELHFFQUFxRTtBQUVyRSwrQ0FBK0M7QUFDL0MsTUFBTSxHQUFHO0lBRUwsa0ZBQWtGO0lBQzNFLE1BQU0sS0FBSyxRQUFRO1FBRXRCLE9BQU8sUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLElBQUksR0FBRyxDQUFDO0lBQzVDLENBQUM7SUFFRCx5REFBeUQ7SUFDbEQsTUFBTSxLQUFLLEtBQUs7UUFFbkIsT0FBTyxTQUFTLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLElBQUksQ0FBQztJQUNuRSxDQUFDO0lBRUQ7Ozs7Ozs7O09BUUc7SUFDSSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQW9CLEVBQUUsSUFBWSxFQUFFLEdBQVc7UUFFakUsT0FBTyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQztZQUM3QixDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUU7WUFDN0IsQ0FBQyxDQUFDLEdBQUcsQ0FBQztJQUNkLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSSxNQUFNLENBQUMsT0FBTyxDQUNoQixLQUFhLEVBQUUsU0FBcUIsTUFBTSxDQUFDLFFBQVE7UUFFcEQsSUFBSSxNQUFNLEdBQUcsTUFBTSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQU0sQ0FBQztRQUU5QyxJQUFJLENBQUMsTUFBTTtZQUNQLE1BQU0sV0FBVyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXpELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFvQixFQUFFLElBQVk7UUFFeEQsSUFBSyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDO1lBQzVCLE1BQU0sV0FBVyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRTdELE9BQU8sT0FBTyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUUsQ0FBQztJQUN2QyxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBb0IsRUFBRSxHQUFXO1FBRXZELElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFakMsSUFBSyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQztZQUM3QixNQUFNLFdBQVcsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUU1RCxPQUFPLEtBQU0sQ0FBQztJQUNsQixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLE1BQU0sQ0FBQyxVQUFVLENBQUMsU0FBc0IsUUFBUSxDQUFDLElBQUk7UUFFeEQsSUFBSSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQTRCLENBQUM7UUFFbkQsSUFBSyxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUNqRCxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNJLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBbUIsRUFBRSxNQUFtQjtRQUU1RCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUUsQ0FBQztJQUNuRSxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0ksTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUF5QixFQUFFLElBQVksRUFBRSxRQUFnQixFQUFFO1FBRy9FLElBQUksTUFBTSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFzQixDQUFDO1FBRW5FLE1BQU0sQ0FBQyxJQUFJLEdBQUksSUFBSSxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBRXJCLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkIsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBdUIsRUFBRSxLQUFVLEVBQUUsUUFBYztRQUV0RSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssRUFDdkI7WUFDSSxJQUFJLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDekIsSUFBSSxHQUFHLEdBQUssR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRTlDLElBQUksUUFBUSxLQUFLLFNBQVMsSUFBSSxLQUFLLEtBQUssUUFBUTtnQkFDNUMsR0FBRyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7U0FDM0I7SUFDTCxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBZ0I7UUFFekMsSUFBUyxPQUFPLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxTQUFTO1lBQ3hDLE9BQU8sT0FBTyxDQUFDLFdBQVcsSUFBSSxFQUFFLENBQUM7YUFDaEMsSUFBSyxPQUFPLENBQUMsT0FBTyxLQUFLLFFBQVE7WUFDbEMsT0FBTyxFQUFFLENBQUM7UUFFZCw2RUFBNkU7UUFDN0UsZ0ZBQWdGO1FBQ2hGLGlEQUFpRDtRQUNqRCxJQUFJLE1BQU0sR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDO1FBRW5DLElBQUssTUFBTSxJQUFJLE1BQU0sQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDO1lBQzNDLE9BQU8sRUFBRSxDQUFDO1FBRWQsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ2QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRTtZQUM5QyxJQUFJLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBWSxDQUFDLENBQUM7UUFFakUsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSSxNQUFNLENBQUMscUJBQXFCLENBQUMsT0FBZ0I7UUFFaEQsT0FBTyxPQUFPLENBQUMsS0FBSyxDQUFFLEdBQUcsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUUsQ0FBQztJQUN4RCxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxJQUFpQixFQUFFLEdBQVc7UUFHaEUsSUFBSSxHQUFHLEtBQUssQ0FBQztZQUNULE1BQU0sS0FBSyxDQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUUsQ0FBQztRQUV4QyxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFDbkIsSUFBSSxNQUFNLEdBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUVqQyxJQUFJLENBQUMsTUFBTTtZQUNQLE9BQU8sSUFBSSxDQUFDO1FBRWhCLE9BQU8sSUFBSSxFQUNYO1lBQ0ksbUVBQW1FO1lBQ25FLElBQVMsR0FBRyxHQUFHLENBQUM7Z0JBQ1osT0FBTyxHQUFHLE9BQU8sQ0FBQyxzQkFBcUM7dUJBQ2hELE1BQU0sQ0FBQyxnQkFBK0IsQ0FBQztpQkFDN0MsSUFBSSxHQUFHLEdBQUcsQ0FBQztnQkFDWixPQUFPLEdBQUcsT0FBTyxDQUFDLGtCQUFpQzt1QkFDNUMsTUFBTSxDQUFDLGlCQUFnQyxDQUFDO1lBRW5ELGdFQUFnRTtZQUNoRSxJQUFJLE9BQU8sS0FBSyxJQUFJO2dCQUNoQixPQUFPLElBQUksQ0FBQztZQUVoQiw0REFBNEQ7WUFDNUQsSUFBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNO2dCQUNwQixJQUFLLE9BQU8sQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDO29CQUNqQyxPQUFPLE9BQU8sQ0FBQztTQUN0QjtJQUNMLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBa0I7UUFFcEMsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQztRQUVqQyxPQUFPLE1BQU07WUFDVCxDQUFDLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDO1lBQ3RELENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNiLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBVztRQUVqQyxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDO1FBRTlCLE9BQU8sTUFBTTtZQUNULENBQUMsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUM7WUFDeEQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2IsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFvQixFQUFFLEtBQWU7UUFFNUQsSUFBSSxNQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO1FBRTdCLG9EQUFvRDtRQUNwRCxJQUFJLE1BQU0sS0FBSyxLQUFLO1lBQ2hCLE9BQU87UUFFWCxPQUFPLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUV4QixRQUFRLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxPQUFPLENBQUMsRUFBRSxJQUFJLENBQUM7YUFDN0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUUsQ0FBaUIsQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxNQUFNLENBQUMsZUFBZSxDQUFDLEdBQUcsSUFBK0I7UUFFNUQsSUFBSSxDQUFDLE9BQU8sQ0FBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBRSxDQUFDO0lBQ2pELENBQUM7Q0FDSjtBQ3BTRCxxRUFBcUU7QUFFckUsdUVBQXVFO0FBQ3ZFLE1BQU0sUUFBUTtJQU9WOzs7OztPQUtHO0lBQ0ksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFZLEVBQUUsS0FBYTtRQUU5QyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTdCLEdBQUcsQ0FBQyxTQUFTLEdBQUcsc0JBQXNCLElBQUksTUFBTSxDQUFDO1FBRWpELEtBQUssQ0FBQyxJQUFJLENBQUM7YUFDTixJQUFJLENBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUU7YUFDekIsSUFBSSxDQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFFO2FBQ2xELEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsbUJBQW1CLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzFFLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNLLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBWTtRQUU3QixJQUFJLEtBQUssR0FBd0IsRUFBRSxDQUFDO1FBRXBDLDJCQUEyQjtRQUMzQixJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUV0RCxnRUFBZ0U7UUFDaEUsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFFNUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNiLE9BQU8sRUFBRSxDQUFDO1FBQ2QsQ0FBQyxDQUFDLENBQUM7UUFFSCw4RUFBOEU7UUFDOUUsdUNBQXVDO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUNqRCxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxvQ0FBb0MsQ0FBQyxNQUFNO1lBQ2pFLENBQUMsQ0FBQyxLQUFLLENBQ2QsQ0FBQztJQUNOLENBQUM7O0FBbERELDZDQUE2QztBQUNyQixtQkFBVSxHQUFHLDRCQUE0QixDQUFDO0FBQ2xFLGlEQUFpRDtBQUN6QixrQkFBUyxHQUFJLHlCQUF5QixDQUFDO0FDUm5FLHFFQUFxRTtBQUVyRSxvREFBb0Q7QUFDcEQsTUFBTSxLQUFLO0lBRVAsMkNBQTJDO0lBQ3BDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBVztRQUU3QixHQUFHLEdBQUcsR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBRXhCLElBQUksR0FBRyxLQUFLLE1BQU0sSUFBSyxHQUFHLEtBQUssR0FBRztZQUM5QixPQUFPLElBQUksQ0FBQztRQUNoQixJQUFJLEdBQUcsS0FBSyxPQUFPLElBQUksR0FBRyxLQUFLLEdBQUc7WUFDOUIsT0FBTyxLQUFLLENBQUM7UUFFakIsTUFBTSxLQUFLLENBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBRSxDQUFDO0lBQ3RDLENBQUM7Q0FDSjtBQ2pCRCxxRUFBcUU7QUFFckUsaURBQWlEO0FBQ2pELE1BQU0sTUFBTTtJQUVSOzs7Ozs7T0FNRztJQUNJLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBYyxDQUFDLEVBQUUsTUFBYyxDQUFDO1FBRTlDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBRSxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUUsR0FBRyxHQUFHLENBQUM7SUFDM0QsQ0FBQztJQUVELG1GQUFtRjtJQUM1RSxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQWU7UUFFL0IsT0FBTyxHQUFHLENBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBRSxDQUFDO0lBQ2hELENBQUM7SUFFRCxrREFBa0Q7SUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBSSxHQUFRO1FBRWpDLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCw2Q0FBNkM7SUFDdEMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFPO1FBRTNCLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBRSxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFFLENBQUM7SUFDNUMsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQWlCLEVBQUU7UUFFbEMsT0FBTyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRyxNQUFNLENBQUM7SUFDdkMsQ0FBQztDQUNKO0FDNUNELHFFQUFxRTtBQUVyRSw0Q0FBNEM7QUFDNUMsTUFBTSxNQUFNO0lBRVI7Ozs7OztPQU1HO0lBQ0ksTUFBTSxDQUFPLE1BQU0sQ0FBQyxPQUFxQixFQUFFLE1BQW1COztZQUdqRSxPQUFPLElBQUksT0FBTyxDQUFpQixDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtnQkFFbkQsT0FBTyxPQUFPLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDNUQsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO0tBQUE7Q0FDSjtBQ3BCRCxxRUFBcUU7QUFFckUsK0NBQStDO0FBQy9DLE1BQU0sT0FBTztJQUVULG9GQUFvRjtJQUM3RSxNQUFNLENBQUMsYUFBYSxDQUFDLEdBQThCO1FBRXRELE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDL0IsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNJLE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBZSxFQUFFLE9BQWU7UUFFMUQsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLElBQUksS0FBSyxHQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUUzQixLQUFLLENBQUMsT0FBTyxDQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUM7UUFFakUsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUM7WUFDbEIsTUFBTSxHQUFHLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQztnQkFDNUIsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPO2dCQUNwQixDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBRW5CO1lBQ0ksSUFBSSxXQUFXLEdBQUcsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBRTlCLE1BQU0sR0FBSSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNCLE1BQU0sSUFBSSxRQUFRLFdBQVcsRUFBRSxDQUFDO1NBQ25DO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFvQixFQUFFLFVBQWtCLENBQUM7UUFFNUQsSUFBSSxLQUFLLFlBQVksSUFBSSxFQUN6QjtZQUNJLE9BQU8sR0FBRyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDN0IsS0FBSyxHQUFLLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztTQUM5QjtRQUVELE9BQU8sS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRztZQUMxQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQscUVBQXFFO0lBQzlELE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBWTtRQUU1QixPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUU7YUFDYixPQUFPLENBQUMsVUFBVSxFQUFJLEVBQUUsQ0FBRzthQUMzQixPQUFPLENBQUMsVUFBVSxFQUFJLEdBQUcsQ0FBRTthQUMzQixPQUFPLENBQUMsUUFBUSxFQUFNLEdBQUcsQ0FBRTthQUMzQixPQUFPLENBQUMsUUFBUSxFQUFNLEdBQUcsQ0FBRTthQUMzQixPQUFPLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFRCx5RUFBeUU7SUFDbEUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFZO1FBRS9CLE9BQU8sSUFBSTthQUNOLFdBQVcsRUFBRTtZQUNkLGtCQUFrQjthQUNqQixPQUFPLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQztZQUN2QixzQkFBc0I7YUFDckIsT0FBTyxDQUFDLGtEQUFrRCxFQUFFLEVBQUUsQ0FBQzthQUMvRCxJQUFJLEVBQUU7WUFDUCxnQ0FBZ0M7YUFDL0IsT0FBTyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUM7WUFDckIsaUNBQWlDO2FBQ2hDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDO1lBQzNCLHVFQUF1RTthQUN0RSxTQUFTLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCwrRUFBK0U7SUFDeEUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFZLEVBQUUsT0FBZSxFQUFFLEdBQVc7UUFHL0QsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVoQyxPQUFPLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN4QixDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQztZQUNaLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDcEIsQ0FBQztDQUNKO0FDakdELHFFQUFxRTtBQ0FyRSxxRUFBcUU7QUFFckUsOERBQThEO0FBQzlELE1BQU0sUUFBUTtJQWVWLFlBQW1CLFFBQWtCO1FBRWpDLElBQUksS0FBSyxHQUFJLFFBQVEsQ0FBQyxjQUFjLENBQUM7UUFDckMsSUFBSSxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBc0IsS0FBSyxDQUFDLENBQUM7UUFFckQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlO1lBQ3ZCLE1BQU0sS0FBSyxDQUFFLENBQUMsQ0FBQywrQkFBK0IsQ0FBQyxLQUFLLENBQUMsQ0FBRSxDQUFDO1FBRTVELElBQUksQ0FBQyxVQUFVLEdBQU0sTUFBTSxDQUFDLGVBQWUsQ0FBQztRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFTLFFBQVEsQ0FBQyxXQUFXLENBQUM7UUFDMUMsSUFBSSxDQUFDLEtBQUssR0FBVyxRQUFRLENBQUMsU0FBUyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxRQUFRLEdBQVEsUUFBUSxDQUFDLFlBQVksQ0FBQztRQUMzQyxJQUFJLENBQUMsUUFBUSxHQUFRLFFBQVEsQ0FBQyxZQUFZLENBQUM7UUFDM0MsSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFFdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQzFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xELE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRCx3REFBd0Q7SUFDakQsVUFBVTtRQUViLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVELGlDQUFpQztJQUMxQixTQUFTO1FBRVosT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLFNBQVMsQ0FBQyxFQUFVO1FBRXZCLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQWdCLENBQUM7UUFFMUUsSUFBSSxNQUFNO1lBQ04sTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFnQixDQUFDO1FBRW5ELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLFlBQVksQ0FBQyxFQUFVO1FBRTFCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRCx1Q0FBdUM7SUFDaEMsV0FBVztRQUVkLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxlQUFlLENBQUMsT0FBa0I7UUFFckMsOEVBQThFO1FBQzlFLHdFQUF3RTtRQUN4RSxJQUFJLE9BQU87WUFBRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLEVBQUUsRUFDeEQ7Z0JBQ0ksSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRTVDLElBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQztvQkFDekIsT0FBTyxLQUFLLENBQUM7YUFDcEI7UUFFRCxPQUFPLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLFVBQVUsQ0FBQyxJQUFZO1FBRTFCLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFbEMsSUFBSSxDQUFDLE9BQU87WUFDUixPQUFPLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV0QyxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVE7WUFDM0IsT0FBTyxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQztnQkFDakMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLENBQUMsQ0FBQyxPQUFPLENBQUM7O1lBRWQsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJO2dCQUNoQixDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQztnQkFDMUIsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7SUFDM0IsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSSxhQUFhLENBQUMsSUFBWTtRQUU3QixJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWxDLGtCQUFrQjtRQUNsQixJQUFTLENBQUMsT0FBTztZQUNiLE9BQU8sS0FBSyxDQUFDO1FBQ2pCLDRDQUE0QzthQUN2QyxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVE7WUFDaEMsT0FBTyxJQUFJLENBQUM7O1lBRVosT0FBTyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLGdCQUFnQixDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLEVBQUUsRUFBRSxPQUFtQjtRQUUxRCxJQUFJLEdBQUcsR0FBRyxHQUFHLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTTtZQUM3QyxNQUFNLEtBQUssQ0FBRSxDQUFDLENBQUMsb0JBQW9CLEVBQUUsQ0FBRSxDQUFDO1FBRTVDLElBQUksTUFBTSxHQUFhLEVBQUUsQ0FBQztRQUUxQixJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNsQyxJQUFJLEtBQUssR0FBSSxDQUFDLENBQUM7UUFFZixPQUFPLE1BQU0sQ0FBQyxNQUFNLEdBQUcsTUFBTSxFQUM3QjtZQUNJLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRTFDLDBFQUEwRTtZQUMxRSxtREFBbUQ7WUFDbkQsSUFBSSxLQUFLLEVBQUUsSUFBSSxJQUFJLENBQUMsYUFBYTtnQkFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVyQixrRUFBa0U7aUJBQzdELElBQUssT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDO2dCQUNoRSxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRXJCLHNEQUFzRDtpQkFDakQsSUFBSyxDQUFDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDO2dCQUN2QyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ3hCO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztDQUNKO0FDM0xELHFFQUFxRTtBQUVyRSx3RUFBd0U7QUFDeEUsTUFBTSxHQUFHO0lBZUw7Ozs7T0FJRztJQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBa0I7UUFFakMsTUFBTSxDQUFDLE9BQU8sR0FBZ0IsS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hELE1BQU0sQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFeEQsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRVosR0FBRyxDQUFDLE1BQU0sR0FBSyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoQyxHQUFHLENBQUMsUUFBUSxHQUFHLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3RDLEdBQUcsQ0FBQyxLQUFLLEdBQU0sSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUMzQixHQUFHLENBQUMsT0FBTyxHQUFJLElBQUksT0FBTyxFQUFFLENBQUM7UUFDN0IsR0FBRyxDQUFDLE1BQU0sR0FBSyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBRTVCLFFBQVE7UUFFUixHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNoQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2pDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNuQixDQUFDO0lBRUQsOENBQThDO0lBQ3ZDLE1BQU0sQ0FBQyxRQUFRO1FBRWxCLEdBQUcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUN4QixHQUFHLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVCLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFRCxrQ0FBa0M7SUFDM0IsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFZO1FBRTNCLEdBQUcsQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBRSxJQUFJLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQVcsQ0FBQztRQUNwRSxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUM1QixHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELCtFQUErRTtJQUN2RSxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQXdCLGVBQWU7UUFFeEQsSUFBSSxHQUFHLEdBQUcsOENBQThDO1lBQzlDLDZDQUE2QztZQUM3QyxxQ0FBcUMsS0FBSyxhQUFhO1lBQ3ZELHNEQUFzRDtZQUN0RCxRQUFRLENBQUM7UUFFbkIsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDO0lBQ2xDLENBQUM7Q0FDSjtBQ3RFRCxxRUFBcUU7QUFFckUsOEVBQThFO0FBQzlFLE1BQU0sS0FBSztJQUFYO1FBRUksOEVBQThFO1FBQ3RFLGtCQUFhLEdBQTBCLEVBQUUsQ0FBQztRQUNsRCx3RUFBd0U7UUFDaEUsYUFBUSxHQUErQixFQUFFLENBQUM7UUFDbEQsb0VBQW9FO1FBQzVELGNBQVMsR0FBOEIsRUFBRSxDQUFDO1FBQ2xELDZFQUE2RTtRQUNyRSxnQkFBVyxHQUE0QixFQUFFLENBQUM7UUFDbEQsb0VBQW9FO1FBQzVELGNBQVMsR0FBOEIsRUFBRSxDQUFDO1FBQ2xELHlFQUF5RTtRQUNqRSxjQUFTLEdBQThCLEVBQUUsQ0FBQztRQUNsRCxnRkFBZ0Y7UUFDeEUsa0JBQWEsR0FBMEIsRUFBRSxDQUFDO1FBQ2xELDhEQUE4RDtRQUN0RCxXQUFNLEdBQWlDLEVBQUUsQ0FBQztJQWthdEQsQ0FBQztJQXpaRzs7OztPQUlHO0lBQ0ksUUFBUSxDQUFDLE9BQWU7UUFFM0IsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLFNBQVM7WUFDcEMsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRWxDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDakQsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLFFBQVEsQ0FBQyxPQUFlLEVBQUUsS0FBYTtRQUUxQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQztJQUNuQyxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSSxZQUFZLENBQUMsR0FBVyxFQUFFLE1BQWM7UUFFM0MsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxLQUFLLFNBQVM7WUFDckMsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRW5DLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQy9DLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSSxZQUFZLENBQUMsR0FBVyxFQUFFLEtBQWM7UUFFM0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDcEMsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxVQUFVLENBQUMsT0FBZTtRQUU3QixJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEtBQUssU0FBUztZQUNyQyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFbkMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFFckIsUUFBTyxPQUFPLEVBQ2Q7WUFDSSxLQUFLLFNBQVM7Z0JBQVEsR0FBRyxHQUFHLENBQUMsQ0FBQztnQkFBQyxHQUFHLEdBQUcsRUFBRSxDQUFDO2dCQUFDLE1BQU07WUFDL0MsS0FBSyxTQUFTO2dCQUFRLEdBQUcsR0FBRyxDQUFDLENBQUM7Z0JBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQztnQkFBQyxNQUFNO1lBQy9DLEtBQUssZUFBZTtnQkFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDO2dCQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7Z0JBQUUsTUFBTTtZQUMvQyxLQUFLLGNBQWM7Z0JBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztnQkFBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO2dCQUFFLE1BQU07U0FDbEQ7UUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQy9DLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSSxVQUFVLENBQUMsT0FBZSxFQUFFLEtBQWE7UUFFNUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDcEMsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxlQUFlLENBQUMsR0FBVztRQUU5QixJQUFJLFNBQVMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMvQyxJQUFJLEdBQUcsR0FBUyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXRDLGlFQUFpRTtRQUNqRSxJQUFJLENBQUMsU0FBUztZQUNWLE1BQU0sS0FBSyxDQUFFLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBRSxDQUFDO1FBRTlDLHFEQUFxRDtRQUNyRCxJQUFJLEdBQUcsS0FBSyxTQUFTLElBQUksU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxTQUFTO1lBQzFELElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFekUsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLGVBQWUsQ0FBQyxHQUFXLEVBQUUsR0FBVztRQUUzQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUNoQyxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLFVBQVUsQ0FBQyxPQUFlO1FBRTdCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsS0FBSyxTQUFTO1lBQ3JDLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVuQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDckQsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLFVBQVUsQ0FBQyxPQUFlLEVBQUUsT0FBZTtRQUU5QyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLE9BQU8sQ0FBQztJQUN0QyxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLFVBQVUsQ0FBQyxPQUFlO1FBRTdCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsS0FBSyxTQUFTO1lBQ3JDLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVuQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDekQsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLFVBQVUsQ0FBQyxPQUFlLEVBQUUsSUFBWTtRQUUzQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNuQyxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLGNBQWMsQ0FBQyxPQUFlO1FBRWpDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsS0FBSyxTQUFTO1lBQ3pDLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUNsQyxJQUFJLE9BQU8sS0FBSyxlQUFlO1lBQ2hDLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUxQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUV0QixRQUFPLE9BQU8sRUFDZDtZQUNJLEtBQUssZUFBZTtnQkFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDO2dCQUFDLEdBQUcsR0FBRyxFQUFFLENBQUM7Z0JBQUMsTUFBTTtZQUMvQyxLQUFLLFNBQVM7Z0JBQVEsR0FBRyxHQUFHLENBQUMsQ0FBQztnQkFBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO2dCQUFFLE1BQU07WUFDL0MsS0FBSyxjQUFjO2dCQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7Z0JBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztnQkFBRSxNQUFNO1NBQ2xEO1FBRUQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN0RSxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksY0FBYyxDQUFDLE9BQWUsRUFBRSxLQUFlO1FBRWxELElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBRXBDLElBQUksT0FBTyxLQUFLLGVBQWU7WUFDM0IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDOUMsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxPQUFPLENBQUMsT0FBZTtRQUUxQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssU0FBUztZQUNsQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFaEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFFLENBQUM7UUFDaEYsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLE9BQU8sQ0FBQyxPQUFlLEVBQUUsSUFBWTtRQUV4QyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNoQyxDQUFDO0lBRUQsb0RBQW9EO0lBQ3BELElBQVcsTUFBTTtRQUViLElBQUksSUFBSSxDQUFDLE9BQU87WUFDWixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7UUFFeEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3pDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUN4QixDQUFDO0lBRUQsOEJBQThCO0lBQzlCLElBQVcsTUFBTSxDQUFDLEtBQWE7UUFFM0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7SUFDekIsQ0FBQztJQUVELHNEQUFzRDtJQUN0RCxJQUFXLFFBQVE7UUFFZixJQUFJLElBQUksQ0FBQyxTQUFTO1lBQ2QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO1FBRTFCLElBQUksUUFBUSxHQUFjLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRW5DLGlEQUFpRDtRQUNqRCxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDekIsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRTtZQUM5QixDQUFDLENBQUMsR0FBRyxDQUFDO1FBRVYsZUFBZTtRQUNmLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUc7WUFDbkIsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBRTdDLDJEQUEyRDtRQUMzRCxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFO1lBQ2xCLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDekIsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO2dCQUNyQixDQUFDLENBQUMsRUFBRSxDQUFDO1FBRWIsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDMUIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQzFCLENBQUM7SUFFRCxnQ0FBZ0M7SUFDaEMsSUFBVyxRQUFRLENBQUMsS0FBZTtRQUUvQixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztJQUMzQixDQUFDO0lBRUQseURBQXlEO0lBQ3pELElBQVcsS0FBSztRQUVaLElBQUksSUFBSSxDQUFDLE1BQU07WUFDWCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7UUFFdkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBRUQsbUNBQW1DO0lBQ25DLElBQVcsS0FBSyxDQUFDLEtBQWE7UUFFMUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7SUFDeEIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxlQUFlO1FBRWxCLG9DQUFvQztRQUVwQyxJQUFJLFNBQVMsR0FBSyxHQUFHLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN2RCxJQUFJLFdBQVcsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDbEUsSUFBSSxVQUFVLEdBQUksQ0FBQyxHQUFHLFNBQVMsRUFBRSxHQUFHLFdBQVcsQ0FBQyxDQUFDO1FBRWpELDREQUE0RDtRQUM1RCxJQUFJLFNBQVMsR0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDcEUsNkVBQTZFO1FBQzdFLElBQUksYUFBYSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFDbEQsQ0FBQyxHQUFHLFVBQVUsRUFBRSxHQUFHLFNBQVMsQ0FBQyxDQUNoQyxDQUFDO1FBRUYsMEVBQTBFO1FBQzFFLElBQUksUUFBUSxHQUFLLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDckQsSUFBSSxVQUFVLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFOUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQVEsU0FBUyxDQUFDLENBQUM7UUFDaEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxlQUFlLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQVEsU0FBUyxDQUFDLENBQUM7UUFDaEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxjQUFjLEVBQUcsYUFBYSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQVEsVUFBVSxDQUFDLENBQUM7UUFFakQsK0JBQStCO1FBRS9CLG9FQUFvRTtRQUNwRSxJQUFJLFFBQVEsR0FBSSxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQy9DLGdEQUFnRDtRQUNoRCxJQUFJLE1BQU0sR0FBTSxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNoRCw4RUFBOEU7UUFDOUUsSUFBSSxLQUFLLEdBQU8sU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFFLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUk7WUFDMUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUUsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDO1FBQy9DLGdGQUFnRjtRQUNoRixJQUFJLFNBQVMsR0FBRyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUM7WUFDaEMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUUsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBSTtZQUMxQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUM7UUFFL0MsdUVBQXVFO1FBQ3ZFLElBQUksV0FBVyxHQUFHLFdBQVcsQ0FBQyxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3RELDJFQUEyRTtRQUMzRSxJQUFJLFVBQVUsR0FBSSxNQUFNLENBQUMsS0FBSyxDQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQztRQUMzRCx5RUFBeUU7UUFDekUsSUFBSSxRQUFRLEdBQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7WUFDM0MsR0FBRyxVQUFVLEVBQUUsR0FBRyxTQUFTLEVBQUUsR0FBRyxhQUFhLEVBQUUsR0FBRyxVQUFVO1lBQzVELFNBQVMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxVQUFVO1NBQ3BELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxFQUFZLFNBQVMsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxFQUFRLE1BQU0sQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxVQUFVLENBQUMsbUJBQW1CLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQWEsUUFBUSxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQWEsUUFBUSxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQWdCLEtBQUssQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFVLFVBQVUsQ0FBQyxDQUFDO1FBRWpELG9DQUFvQztRQUVwQyxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTVDLDhFQUE4RTtRQUM5RSw4RUFBOEU7UUFDOUUsSUFBSSxVQUFVLElBQUksQ0FBQyxFQUNuQjtZQUNJLElBQUksZUFBZSxHQUFHLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMzQyxJQUFJLGNBQWMsR0FBSSxVQUFVLEdBQUcsZUFBZSxDQUFDO1lBRW5ELElBQUksQ0FBQyxVQUFVLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ2xELElBQUksQ0FBQyxVQUFVLENBQUMsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1NBQ25EO1FBRUQsa0VBQWtFO1FBQ2xFLCtEQUErRDtRQUMvRCxJQUFJLFVBQVUsSUFBSSxDQUFDLEVBQ25CO1lBQ0ksSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2RCxJQUFJLENBQUMsUUFBUSxDQUFFLE9BQU8sRUFBTSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFFLENBQUM7WUFDMUQsSUFBSSxDQUFDLFFBQVEsQ0FBRSxNQUFNLEVBQU8sTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBRSxDQUFDO1lBQzFELElBQUksQ0FBQyxRQUFRLENBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUUsQ0FBQztZQUMxRCxJQUFJLENBQUMsUUFBUSxDQUFFLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFFLENBQUM7U0FDN0Q7UUFFRCwrQkFBK0I7UUFFL0IsaUZBQWlGO1FBQ2pGLGtGQUFrRjtRQUNsRixJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQ3BDO1lBQ0ksSUFBSSxRQUFRLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFN0MsSUFBSSxDQUFDLFVBQVUsQ0FBRSxVQUFVLEVBQUssTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBRSxDQUFDO1lBQy9ELElBQUksQ0FBQyxVQUFVLENBQUUsYUFBYSxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUUsQ0FBQztTQUNsRTtRQUVELDRCQUE0QjtRQUM1QixzQ0FBc0M7UUFFdEMsdUVBQXVFO1FBQ3ZFLElBQUksSUFBSSxHQUFNLElBQUksSUFBSSxDQUFFLElBQUksSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFDMUUsSUFBSSxPQUFPLEdBQUcsSUFBSSxJQUFJLENBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDO1FBRTFFLElBQUksQ0FBQyxPQUFPLENBQUUsTUFBTSxFQUFTLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUssQ0FBQztRQUN6RCxJQUFJLENBQUMsT0FBTyxDQUFFLGFBQWEsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFFLENBQUM7SUFDN0QsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogR2xvYmFsIHJlZmVyZW5jZSB0byB0aGUgbGFuZ3VhZ2UgY29udGFpbmVyLCBzZXQgYXQgaW5pdCAqL1xyXG5sZXQgTCA6IEVuZ2xpc2hMYW5ndWFnZTtcclxuXHJcbmNsYXNzIEkxOG5cclxue1xyXG4gICAgLyoqIENvbnN0YW50IHJlZ2V4IHRvIG1hdGNoIGZvciB0cmFuc2xhdGlvbiBrZXlzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBUQUdfUkVHRVggOiBSZWdFeHAgPSAvJVtBLVpfXSslLztcclxuXHJcbiAgICAvKiogTGFuZ3VhZ2VzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGxhbmd1YWdlcyAgIDogRGljdGlvbmFyeTxFbmdsaXNoTGFuZ3VhZ2U+O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBsYW5ndWFnZSBjdXJyZW50bHkgaW4gdXNlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBjdXJyZW50TGFuZyA6IEVuZ2xpc2hMYW5ndWFnZTtcclxuXHJcbiAgICAvKiogUGlja3MgYSBsYW5ndWFnZSwgYW5kIHRyYW5zZm9ybXMgYWxsIHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGRvY3VtZW50ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5sYW5ndWFnZXMpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSTE4biBpcyBhbHJlYWR5IGluaXRpYWxpemVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMubGFuZ3VhZ2VzID0ge1xyXG4gICAgICAgICAgICAnZW4nIDogbmV3IEVuZ2xpc2hMYW5ndWFnZSgpXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTGFuZ3VhZ2Ugc2VsZWN0aW9uXHJcbiAgICAgICAgTCA9IHRoaXMuY3VycmVudExhbmcgPSB0aGlzLmxhbmd1YWdlc1snZW4nXTtcclxuXHJcbiAgICAgICAgSTE4bi5hcHBseVRvRG9tKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXYWxrcyB0aHJvdWdoIGFsbCB0ZXh0IG5vZGVzIGluIHRoZSBET00sIHJlcGxhY2luZyBhbnkgdHJhbnNsYXRpb24ga2V5cy5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMDczMDc3Ny8zMzU0OTIwXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGFwcGx5VG9Eb20oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV4dCA6IE5vZGUgfCBudWxsO1xyXG4gICAgICAgIGxldCB3YWxrID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keSxcclxuICAgICAgICAgICAgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQgfCBOb2RlRmlsdGVyLlNIT1dfVEVYVCxcclxuICAgICAgICAgICAgeyBhY2NlcHROb2RlOiBJMThuLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIG5leHQgPSB3YWxrLm5leHROb2RlKCkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5leHQgYXMgRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuYXR0cmlidXRlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgICAgICAgICBJMThuLmV4cGFuZEF0dHJpYnV0ZShlbGVtZW50LmF0dHJpYnV0ZXNbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIG5leHQudGV4dENvbnRlbnQpXHJcbiAgICAgICAgICAgICAgICBJMThuLmV4cGFuZFRleHROb2RlKG5leHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsdGVycyB0aGUgdHJlZSB3YWxrZXIgdG8gZXhjbHVkZSBzY3JpcHQgYW5kIHN0eWxlIHRhZ3MgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFnID0gKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICA/IChub2RlIGFzIEVsZW1lbnQpLnRhZ05hbWUudG9VcHBlckNhc2UoKVxyXG4gICAgICAgICAgICA6IG5vZGUucGFyZW50RWxlbWVudCEudGFnTmFtZS50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgICAgICByZXR1cm4gWydTQ1JJUFQnLCAnU1RZTEUnXS5pbmNsdWRlcyh0YWcpXHJcbiAgICAgICAgICAgID8gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUXHJcbiAgICAgICAgICAgIDogTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiBhdHRyaWJ1dGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZEF0dHJpYnV0ZShhdHRyOiBBdHRyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTZXR0aW5nIGFuIGF0dHJpYnV0ZSwgZXZlbiBpZiBub3RoaW5nIGFjdHVhbGx5IGNoYW5nZXMsIHdpbGwgY2F1c2UgdmFyaW91c1xyXG4gICAgICAgIC8vIHNpZGUtZWZmZWN0cyAoZS5nLiByZWxvYWRpbmcgaWZyYW1lcykuIFNvLCBhcyB3YXN0ZWZ1bCBhcyB0aGlzIGxvb2tzLCB3ZSBoYXZlXHJcbiAgICAgICAgLy8gdG8gbWF0Y2ggZmlyc3QgYmVmb3JlIGFjdHVhbGx5IHJlcGxhY2luZy5cclxuXHJcbiAgICAgICAgaWYgKCBhdHRyLnZhbHVlLm1hdGNoKHRoaXMuVEFHX1JFR0VYKSApXHJcbiAgICAgICAgICAgIGF0dHIudmFsdWUgPSBhdHRyLnZhbHVlLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEV4cGFuZHMgYW55IHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGdpdmVuIHRleHQgbm9kZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZXhwYW5kVGV4dE5vZGUobm9kZTogTm9kZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbm9kZS50ZXh0Q29udGVudCA9IG5vZGUudGV4dENvbnRlbnQhLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcGxhY2VzIGtleSB3aXRoIHZhbHVlIGlmIGl0IGV4aXN0cywgZWxzZSBrZWVwcyB0aGUga2V5ICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXBsYWNlKG1hdGNoOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgID0gbWF0Y2guc2xpY2UoMSwgLTEpO1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IExba2V5XSBhcyBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgICAgICBpZiAoIXZhbHVlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignTWlzc2luZyB0cmFuc2xhdGlvbiBrZXk6JywgbWF0Y2gpO1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgcmV0dXJuICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpXHJcbiAgICAgICAgICAgID8gdmFsdWUoKVxyXG4gICAgICAgICAgICA6IHZhbHVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGVsZWdhdGUgdHlwZSBmb3IgY2hvb3NlciBzZWxlY3QgZXZlbnQgaGFuZGxlcnMgKi9cclxudHlwZSBTZWxlY3REZWxlZ2F0ZSA9IChlbnRyeTogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4vKiogVUkgZWxlbWVudCB3aXRoIGEgZmlsdGVyYWJsZSBhbmQga2V5Ym9hcmQgbmF2aWdhYmxlIGxpc3Qgb2YgY2hvaWNlcyAqL1xyXG5jbGFzcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggY2hvb3NlciBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI2Nob29zZXJUZW1wbGF0ZScpO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgY29udGFpbmVyICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZG9tICAgICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGZpbHRlciBpbnB1dCBib3ggKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnB1dEZpbHRlciAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgb2YgaXRlbSBlbGVtZW50cyAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0Q2hvaWNlcyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBPcHRpb25hbCBldmVudCBoYW5kbGVyIHRvIGZpcmUgd2hlbiBhbiBpdGVtIGlzIHNlbGVjdGVkIGJ5IHRoZSB1c2VyICovXHJcbiAgICBwdWJsaWMgICAgb25TZWxlY3Q/ICAgICA6IFNlbGVjdERlbGVnYXRlO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gdmlzdWFsbHkgc2VsZWN0IHRoZSBjbGlja2VkIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyAgICBzZWxlY3RPbkNsaWNrIDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgaXRlbSwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZG9tU2VsZWN0ZWQ/ICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgYXV0by1maWx0ZXIgdGltZW91dCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZmlsdGVyVGltZW91dCA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogV2hldGhlciB0byBncm91cCBhZGRlZCBlbGVtZW50cyBieSBhbHBoYWJldGljYWwgc2VjdGlvbnMgKi9cclxuICAgIHByb3RlY3RlZCBncm91cEJ5QUJDICAgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFRpdGxlIGF0dHJpYnV0ZSB0byBhcHBseSB0byBldmVyeSBpdGVtIGFkZGVkICovXHJcbiAgICBwcm90ZWN0ZWQgaXRlbVRpdGxlICAgICA6IHN0cmluZyA9ICdDbGljayB0byBzZWxlY3QgdGhpcyBpdGVtJztcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhIGNob29zZXIsIGJ5IHJlcGxhY2luZyB0aGUgcGxhY2Vob2xkZXIgaW4gYSBnaXZlbiBwYXJlbnQgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIGlmICghQ2hvb3Nlci5URU1QTEFURSlcclxuICAgICAgICAgICAgQ2hvb3Nlci5pbml0KCk7XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXQgICAgICA9IERPTS5yZXF1aXJlKCdjaG9vc2VyJywgcGFyZW50KTtcclxuICAgICAgICBsZXQgcGxhY2Vob2xkZXIgPSBET00uZ2V0QXR0cih0YXJnZXQsICdwbGFjZWhvbGRlcicsIEwuUF9HRU5FUklDX1BIKTtcclxuICAgICAgICBsZXQgdGl0bGUgICAgICAgPSBET00uZ2V0QXR0cih0YXJnZXQsICd0aXRsZScsIEwuUF9HRU5FUklDX1QpO1xyXG4gICAgICAgIHRoaXMuaXRlbVRpdGxlICA9IERPTS5nZXRBdHRyKHRhcmdldCwgJ2l0ZW1UaXRsZScsIHRoaXMuaXRlbVRpdGxlKTtcclxuICAgICAgICB0aGlzLmdyb3VwQnlBQkMgPSB0YXJnZXQuaGFzQXR0cmlidXRlKCdncm91cEJ5QUJDJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgID0gQ2hvb3Nlci5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlciAgPSBET00ucmVxdWlyZSgnLmNoU2VhcmNoQm94JywgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcyA9IERPTS5yZXF1aXJlKCcuY2hDaG9pY2VzQm94JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy50aXRsZSAgICAgID0gdGl0bGU7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xyXG4gICAgICAgIC8vIFRPRE86IFJldXNpbmcgdGhlIHBsYWNlaG9sZGVyIGFzIHRpdGxlIGlzIHByb2JhYmx5IGJhZFxyXG4gICAgICAgIC8vIGh0dHBzOi8vbGFrZW4ubmV0L2Jsb2cvbW9zdC1jb21tb24tYTExeS1taXN0YWtlcy9cclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnRpdGxlICAgICAgID0gcGxhY2Vob2xkZXI7XHJcblxyXG4gICAgICAgIHRhcmdldC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2JlZm9yZWJlZ2luJywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRhcmdldC5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIHZhbHVlIHRvIHRoZSBjaG9vc2VyIGFzIGEgc2VsZWN0YWJsZSBpdGVtLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBUZXh0IG9mIHRoZSBzZWxlY3RhYmxlIGl0ZW1cclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZCh2YWx1ZTogc3RyaW5nLCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG5cclxuICAgICAgICBpdGVtLmlubmVyVGV4dCA9IHZhbHVlO1xyXG5cclxuICAgICAgICB0aGlzLmFkZFJhdyhpdGVtLCBzZWxlY3QpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkcyB0aGUgZ2l2ZW4gZWxlbWVudCB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaXRlbSBFbGVtZW50IHRvIGFkZCB0byB0aGUgY2hvb3NlclxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBXaGV0aGVyIHRvIHNlbGVjdCB0aGlzIGl0ZW0gb25jZSBhZGRlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWRkUmF3KGl0ZW06IEhUTUxFbGVtZW50LCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaXRlbS50aXRsZSAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgICAgIGl0ZW0udGFiSW5kZXggPSAtMTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoaXRlbSk7XHJcblxyXG4gICAgICAgIGlmIChzZWxlY3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgaXRlbS5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYXJzIGFsbCBpdGVtcyBmcm9tIHRoaXMgY2hvb3NlciBhbmQgdGhlIGN1cnJlbnQgZmlsdGVyICovXHJcbiAgICBwdWJsaWMgY2xlYXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnZhbHVlICAgICAgPSAnJztcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2VsZWN0IGFuZCBmb2N1cyB0aGUgZW50cnkgdGhhdCBtYXRjaGVzIHRoZSBnaXZlbiB2YWx1ZSAqL1xyXG4gICAgcHVibGljIHByZXNlbGVjdCh2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBrZXkgaW4gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW4pXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaXRlbSA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuW2tleV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IGl0ZW0uaW5uZXJUZXh0KVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsaWNrIGV2ZW50cywgZm9yIGNob29zaW5nIGl0ZW1zICovXHJcbiAgICBwdWJsaWMgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKHRhcmdldCkgKVxyXG4gICAgICAgIGlmICggIXRhcmdldC5oYXNBdHRyaWJ1dGUoJ2Rpc2FibGVkJykgKVxyXG4gICAgICAgICAgICB0aGlzLnNlbGVjdCh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsb3NlIG1ldGhvZHMsIGRvaW5nIGFueSB0aW1lciBjbGVhbnVwICovXHJcbiAgICBwdWJsaWMgb25DbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBpbnB1dCBldmVudHMsIGZvciBmaWx0ZXJpbmcgYW5kIG5hdmlnYXRpb24gKi9cclxuICAgIHB1YmxpYyBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmb2N1c2VkLnBhcmVudEVsZW1lbnQhO1xyXG5cclxuICAgICAgICBpZiAoIWZvY3VzZWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gT25seSBoYW5kbGUgZXZlbnRzIG9uIHRoaXMgY2hvb3NlcidzIGNvbnRyb2xzXHJcbiAgICAgICAgaWYgKCAhdGhpcy5vd25zKGZvY3VzZWQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgdHlwaW5nIGludG8gZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkID09PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoXyA9PiB0aGlzLmZpbHRlcigpLCA1MDApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZWRpcmVjdCB0eXBpbmcgdG8gaW5wdXQgZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkICE9PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIGlmIChrZXkubGVuZ3RoID09PSAxIHx8IGtleSA9PT0gJ0JhY2tzcGFjZScpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlucHV0RmlsdGVyLmZvY3VzKCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwcmVzc2luZyBFTlRFUiBhZnRlciBrZXlib2FyZCBuYXZpZ2F0aW5nIHRvIGFuIGl0ZW1cclxuICAgICAgICBpZiAoIHRoaXMuaXNDaG9pY2UoZm9jdXNlZCkgKVxyXG4gICAgICAgIGlmIChrZXkgPT09ICdFbnRlcicpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdChmb2N1c2VkKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIG5hdmlnYXRpb24gd2hlbiBjb250YWluZXIgb3IgaXRlbSBpcyBmb2N1c2VkXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIGlmIHVzaW5nIGdyb3Vwc1xyXG4gICAgICAgICAgICBpZiAgICAgICggdGhpcy5ncm91cEJ5QUJDICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2dyb3VwJykgKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiBjaG9pY2VzIGFyZSBmbGF0XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCF0aGlzLmdyb3VwQnlBQkMgJiYgZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0Q2hvaWNlcylcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnRcclxuICAgICAgICAgICAgZWxzZSBpZiAoZm9jdXNlZCA9PT0gdGhpcy5kb21TZWxlY3RlZClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyh0aGlzLmRvbVNlbGVjdGVkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIHN1Ym1pdCBldmVudHMsIGZvciBpbnN0YW50IGZpbHRlcmluZyAqL1xyXG4gICAgcHVibGljIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB0aGlzLmZpbHRlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIaWRlIG9yIHNob3cgY2hvaWNlcyBpZiB0aGV5IHBhcnRpYWxseSBtYXRjaCB0aGUgdXNlciBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGZpbHRlcigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgbGV0IGZpbHRlciA9IHRoaXMuaW5wdXRGaWx0ZXIudmFsdWUudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBsZXQgaXRlbXMgID0gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW47XHJcbiAgICAgICAgbGV0IGVuZ2luZSA9IHRoaXMuZ3JvdXBCeUFCQ1xyXG4gICAgICAgICAgICA/IENob29zZXIuZmlsdGVyR3JvdXBcclxuICAgICAgICAgICAgOiBDaG9vc2VyLmZpbHRlckl0ZW07XHJcblxyXG4gICAgICAgIC8vIFByZXZlbnQgYnJvd3NlciByZWRyYXcvcmVmbG93IGR1cmluZyBmaWx0ZXJpbmdcclxuICAgICAgICAvLyBUT0RPOiBNaWdodCB0aGUgdXNlIG9mIGhpZGRlbiBicmVhayBBMTF5IGhlcmU/IChlLmcuIGRlZm9jdXMpXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaGlkZGVuID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGFsbCB0aGUgaXRlbXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBlbmdpbmUoaXRlbXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBcHBsaWVzIGZpbHRlciB0byBhbiBpdGVtLCBzaG93aW5nIGl0IGlmIG1hdGNoZWQsIGhpZGluZyBpZiBub3QgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVySXRlbShpdGVtOiBIVE1MRWxlbWVudCwgZmlsdGVyOiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2hvdyBpZiBjb250YWlucyBzZWFyY2ggdGVybVxyXG4gICAgICAgIGlmIChpdGVtLmlubmVyVGV4dC50b0xvd2VyQ2FzZSgpLmluZGV4T2YoZmlsdGVyKSA+PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaXRlbS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIaWRlIGlmIG5vdFxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICAgICAgcmV0dXJuIDE7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBcHBsaWVzIGZpbHRlciB0byBjaGlsZHJlbiBvZiBhIGdyb3VwLCBoaWRpbmcgdGhlIGdyb3VwIGlmIGFsbCBjaGlsZHJlbiBoaWRlICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGZpbHRlckdyb3VwKGdyb3VwOiBIVE1MRWxlbWVudCwgZmlsdGVyOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyaWVzID0gZ3JvdXAuY2hpbGRyZW47XHJcbiAgICAgICAgbGV0IGNvdW50ICAgPSBlbnRyaWVzLmxlbmd0aCAtIDE7IC8vIC0xIGZvciBoZWFkZXIgZWxlbWVudFxyXG4gICAgICAgIGxldCBoaWRkZW4gID0gMDtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggc3RhdGlvbiBuYW1lIGluIHRoaXMgbGV0dGVyIHNlY3Rpb24uIEhlYWRlciBza2lwcGVkLlxyXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgZW50cmllcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgaGlkZGVuICs9IENob29zZXIuZmlsdGVySXRlbShlbnRyaWVzW2ldIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICAvLyBJZiBhbGwgc3RhdGlvbiBuYW1lcyBpbiB0aGlzIGxldHRlciBzZWN0aW9uIHdlcmUgaGlkZGVuLCBoaWRlIHRoZSBzZWN0aW9uXHJcbiAgICAgICAgaWYgKGhpZGRlbiA+PSBjb3VudClcclxuICAgICAgICAgICAgZ3JvdXAuaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIGdyb3VwLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgYW5kIHVwZGF0ZXMgdGhlIHN0YXRlIGFuZCBlZGl0b3IgKi9cclxuICAgIHByb3RlY3RlZCBzZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgYWxyZWFkeVNlbGVjdGVkID0gKGVudHJ5ID09PSB0aGlzLmRvbVNlbGVjdGVkKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0T25DbGljaylcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5vblNlbGVjdClcclxuICAgICAgICAgICAgdGhpcy5vblNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmIChhbHJlYWR5U2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgY2hhbmdlcyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQgKi9cclxuICAgIHByb3RlY3RlZCB2aXN1YWxTZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSBlbnRyeTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnRhYkluZGV4ID0gNTA7XHJcbiAgICAgICAgZW50cnkuc2V0QXR0cmlidXRlKCdzZWxlY3RlZCcsICd0cnVlJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IHVuc2VsZWN0cyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQsIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFVuc2VsZWN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbVNlbGVjdGVkKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQucmVtb3ZlQXR0cmlidXRlKCdzZWxlY3RlZCcpO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSAtMTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkICAgICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2hldGhlciB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3IgKG93bmVyKSBvZiB0aGUgZ2l2ZW4gZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gY2hlY2sgaWYgdGhpcyBjaG9vc2VyIGlzIGFuIGFuY2VzdG9yIG9mXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvd25zKHRhcmdldDogSFRNTEVsZW1lbnQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBnaXZlbiBlbGVtZW50IGlzIGEgY2hvb3NhYmxlIG9uZSBvd25lZCBieSB0aGlzIGNob29zZXIgKi9cclxuICAgIHByb3RlY3RlZCBpc0Nob2ljZSh0YXJnZXQ/OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRhcmdldCAhPT0gdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICYmIHRhcmdldC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdkZCdcclxuICAgICAgICAgICAgJiYgdGhpcy5vd25zKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVSSBlbGVtZW50IGZvciB0b2dnbGluZyB0aGUgc3RhdGUgb2YgY29sbGFwc2libGUgZWRpdG9yIGVsZW1lbnRzICovXHJcbmNsYXNzIENvbGxhcHNlVG9nZ2xlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHRvZ2dsZSBidXR0b24gRE9NIHRlbXBsYXRlIHRvIGNsb25lICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNjb2xsYXBzaWJsZUJ1dHRvblRlbXBsYXRlJyk7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGF0dGFjaGVzIHRvZ2dsZSBlbGVtZW50IGZvciB0b2dnbGluZyBjb2xsYXBzaWJsZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY3JlYXRlQW5kQXR0YWNoKHBhcmVudDogRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2tpcCBpZiBhIHRvZ2dsZSBpcyBhbHJlYWR5IGF0dGFjaGVkXHJcbiAgICAgICAgaWYgKCBwYXJlbnQucXVlcnlTZWxlY3RvcignLnRvZ2dsZScpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoIUNvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5pbml0KCk7XHJcblxyXG4gICAgICAgIHBhcmVudC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2FmdGVyYmVnaW4nLFxyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgRWxlbWVudFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGdpdmVuIGNvbGxhcHNlIHRvZ2dsZSdzIHRpdGxlIHRleHQsIGRlcGVuZGluZyBvbiBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB1cGRhdGUoc3BhbjogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBzcGFuLmRhdGFzZXRbJ3JlZiddIHx8ICc/Pz8nO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBzcGFuLmRhdGFzZXRbJ3R5cGUnXSE7XHJcbiAgICAgICAgbGV0IHN0YXRlICA9IHNwYW4uaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuICAgICAgICBsZXQgdG9nZ2xlID0gRE9NLnJlcXVpcmUoJy50b2dnbGUnLCBzcGFuKTtcclxuXHJcbiAgICAgICAgdG9nZ2xlLnRpdGxlID0gc3RhdGVcclxuICAgICAgICAgICAgPyBMLlRJVExFX09QVF9PUEVOKHR5cGUsIHJlZilcclxuICAgICAgICAgICAgOiBMLlRJVExFX09QVF9DTE9TRSh0eXBlLCByZWYpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVUkgZWxlbWVudCBmb3Igb3BlbmluZyB0aGUgcGlja2VyIGZvciBwaHJhc2VzZXQgZWRpdG9yIGVsZW1lbnRzICovXHJcbmNsYXNzIFBocmFzZXNldEJ1dHRvblxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2VzZXQgYnV0dG9uIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IFRoaXMgaXMgYmVpbmcgZHVwbGljYXRlZCBpbiB2YXJpb3VzIHBsYWNlczsgRFJZIHdpdGggc3VnYXIgbWV0aG9kXHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjcGhyYXNlc2V0QnV0dG9uVGVtcGxhdGUnKTtcclxuICAgICAgICBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIFBocmFzZXNldEJ1dHRvbi5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgYXR0YWNoZXMgYSBidXR0b24gZm9yIHRoZSBnaXZlbiBwaHJhc2VzZXQgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjcmVhdGVBbmRBdHRhY2gocGhyYXNlc2V0OiBFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTa2lwIGlmIGEgYnV0dG9uIGlzIGFscmVhZHkgYXR0YWNoZWRcclxuICAgICAgICBpZiAoIHBocmFzZXNldC5xdWVyeVNlbGVjdG9yKCcuY2hvb3NlUGhyYXNlJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICghUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBQaHJhc2VzZXRCdXR0b24uaW5pdCgpO1xyXG5cclxuICAgICAgICBsZXQgcmVmICAgICAgPSBET00ucmVxdWlyZURhdGEocGhyYXNlc2V0IGFzIEhUTUxFbGVtZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IGJ1dHRvbiAgID0gUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBidXR0b24udGl0bGUgPSBMLlRJVExFX1BIUkFTRVNFVChyZWYpO1xyXG5cclxuICAgICAgICBwaHJhc2VzZXQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmJlZ2luJywgYnV0dG9uKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwiY2hvb3Nlci50c1wiLz5cclxuXHJcbi8vIFRPRE86IFNlYXJjaCBieSBzdGF0aW9uIGNvZGVcclxuXHJcbi8qKlxyXG4gKiBTaW5nbGV0b24gaW5zdGFuY2Ugb2YgdGhlIHN0YXRpb24gcGlja2VyLiBTaW5jZSB0aGVyZSBhcmUgZXhwZWN0ZWQgdG8gYmUgMjUwMCtcclxuICogc3RhdGlvbnMsIHRoaXMgZWxlbWVudCB3b3VsZCB0YWtlIHVwIGEgbG90IG9mIG1lbW9yeSBhbmQgZ2VuZXJhdGUgYSBsb3Qgb2YgRE9NLiBTbywgaXRcclxuICogaGFzIHRvIGJlIFwic3dhcHBlZFwiIGJldHdlZW4gcGlja2VycyBhbmQgdmlld3MgdGhhdCB3YW50IHRvIHVzZSBpdC5cclxuICovXHJcbmNsYXNzIFN0YXRpb25DaG9vc2VyIGV4dGVuZHMgQ2hvb3NlclxyXG57XHJcbiAgICAvKiogU2hvcnRjdXQgcmVmZXJlbmNlcyB0byBhbGwgdGhlIGdlbmVyYXRlZCBBLVogc3RhdGlvbiBsaXN0IGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVN0YXRpb25zIDogRGljdGlvbmFyeTxIVE1MRExpc3RFbGVtZW50PiA9IHt9O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHBhcmVudCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnRhYkluZGV4ID0gMDtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGVzIHRoZSBsaXN0IG9mIHN0YXRpb25zIGZyb20gdGhlIGRhdGFiYXNlLiBXZSBkbyB0aGlzIGJ5IGNyZWF0aW5nIGEgZGxcclxuICAgICAgICAvLyBlbGVtZW50IGZvciBlYWNoIGxldHRlciBvZiB0aGUgYWxwaGFiZXQsIGNyZWF0aW5nIGEgZHQgZWxlbWVudCBoZWFkZXIsIGFuZCB0aGVuXHJcbiAgICAgICAgLy8gcG9wdWxhdGluZyB0aGUgZGwgd2l0aCBzdGF0aW9uIG5hbWUgZGQgY2hpbGRyZW4uXHJcbiAgICAgICAgT2JqZWN0LmtleXMoUkFHLmRhdGFiYXNlLnN0YXRpb25zKS5mb3JFYWNoKCB0aGlzLmFkZFN0YXRpb24uYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXR0YWNoZXMgdGhpcyBjb250cm9sIHRvIHRoZSBnaXZlbiBwYXJlbnQgYW5kIHJlc2V0cyBzb21lIHN0YXRlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaWNrZXIgUGlja2VyIHRvIGF0dGFjaCB0aGlzIGNvbnRyb2wgdG9cclxuICAgICAqIEBwYXJhbSBvblNlbGVjdCBEZWxlZ2F0ZSB0byBmaXJlIHdoZW4gY2hvb3NpbmcgYSBzdGF0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhdHRhY2gocGlja2VyOiBQaWNrZXIsIG9uU2VsZWN0OiBTZWxlY3REZWxlZ2F0ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBwaWNrZXIuZG9tRm9ybTtcclxuICAgICAgICBsZXQgY3VycmVudCA9IHRoaXMuZG9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIFJlLWVuYWJsZSBhbGwgZGlzYWJsZWQgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5xdWVyeVNlbGVjdG9yQWxsKGBkZFtkaXNhYmxlZF1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaCggdGhpcy5lbmFibGUuYmluZCh0aGlzKSApO1xyXG5cclxuICAgICAgICBpZiAoIWN1cnJlbnQgfHwgY3VycmVudCAhPT0gcGFyZW50KVxyXG4gICAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcbiAgICAgICAgdGhpcy5vblNlbGVjdCA9IG9uU2VsZWN0LmJpbmQocGlja2VyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUHJlLXNlbGVjdHMgYSBzdGF0aW9uIGVudHJ5IGJ5IGl0cyBjb2RlICovXHJcbiAgICBwdWJsaWMgcHJlc2VsZWN0Q29kZShjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9IHRoaXMuZ2V0QnlDb2RlKGNvZGUpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGVudHJ5KTtcclxuICAgICAgICBlbnRyeS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFbmFibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgb3Igc3RhdGlvbiBlbGVtZW50IGZvciBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBlbmFibGUoY29kZU9yTm9kZTogc3RyaW5nIHwgSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9ICh0eXBlb2YgY29kZU9yTm9kZSA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgID8gdGhpcy5nZXRCeUNvZGUoY29kZU9yTm9kZSlcclxuICAgICAgICAgICAgOiBjb2RlT3JOb2RlO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIERpc2FibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgZnJvbSBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBkaXNhYmxlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcbiAgICAgICAgbGV0IG5leHQgID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGVudHJ5LCAxKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgJycpO1xyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgndGFiaW5kZXgnKTtcclxuICAgICAgICBlbnRyeS50aXRsZSA9ICcnO1xyXG5cclxuICAgICAgICAvLyBTaGlmdCBmb2N1cyB0byBuZXh0IGF2YWlsYWJsZSBlbGVtZW50LCBmb3Iga2V5Ym9hcmQgbmF2aWdhdGlvblxyXG4gICAgICAgIGlmIChuZXh0KVxyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgYSBzdGF0aW9uJ3MgY2hvaWNlIGVsZW1lbnQgYnkgaXRzIGNvZGUgKi9cclxuICAgIHByaXZhdGUgZ2V0QnlDb2RlKGNvZGU6IHN0cmluZykgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmlucHV0Q2hvaWNlc1xyXG4gICAgICAgICAgICAucXVlcnlTZWxlY3RvcihgZGRbZGF0YS1jb2RlPSR7Y29kZX1dYCkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgKi9cclxuICAgIHByaXZhdGUgYWRkU3RhdGlvbihjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcbiAgICAgICAgbGV0IGxldHRlciAgPSBzdGF0aW9uWzBdO1xyXG4gICAgICAgIGxldCBncm91cCAgID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdO1xyXG5cclxuICAgICAgICBpZiAoIWdyb3VwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGhlYWRlciAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2R0Jyk7XHJcbiAgICAgICAgICAgIGhlYWRlci5pbm5lclRleHQgPSBsZXR0ZXIudG9VcHBlckNhc2UoKTtcclxuICAgICAgICAgICAgaGVhZGVyLnRhYkluZGV4ICA9IC0xO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkbCcpO1xyXG4gICAgICAgICAgICBncm91cC50YWJJbmRleCA9IDUwO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAuc2V0QXR0cmlidXRlKCdncm91cCcsICcnKTtcclxuICAgICAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoZ3JvdXApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVudHJ5ICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuICAgICAgICBlbnRyeS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgICAgIGVudHJ5LmlubmVyVGV4dCAgICAgICA9IHN0YXRpb247XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgICAgICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICAgICAgZW50cnkudGFiSW5kZXggICAgICAgID0gLTE7XHJcblxyXG4gICAgICAgIGdyb3VwLmFwcGVuZENoaWxkKGVudHJ5KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN0YXRpb24gbGlzdCBpdGVtIHRoYXQgY2FuIGJlIGRyYWdnZWQgYW5kIGRyb3BwZWQgKi9cclxuY2xhc3MgU3RhdGlvbkxpc3RJdGVtXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggaXRlbSBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjc3RhdGlvbkxpc3RJdGVtVGVtcGxhdGUnKTtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgaXRlbSdzIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBzdGF0aW9uIGxpc3QgaXRlbSwgbWVhbnQgZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSB0aGlzIGl0ZW0gZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihjb2RlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUpXHJcbiAgICAgICAgICAgIFN0YXRpb25MaXN0SXRlbS5pbml0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgICA9IFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJUZXh0ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmRhdGFzZXRbJ2NvZGUnXSA9IGNvZGU7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBCYXNlIGNsYXNzIGZvciBwaWNrZXIgdmlld3MgKi9cclxuYWJzdHJhY3QgY2xhc3MgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbSAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGZvcm0gRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb21Gb3JtICAgOiBIVE1MRm9ybUVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgaGVhZGVyIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb21IZWFkZXIgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBuYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIGhhbmRsZXMgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSB4bWxUYWcgICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgYmVpbmcgZWRpdGVkIGJ5IHRoaXMgcGlja2VyICovXHJcbiAgICBwcm90ZWN0ZWQgZG9tRWRpdGluZz8gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBwaWNrZXIgdG8gaGFuZGxlIHRoZSBnaXZlbiBwaHJhc2UgZWxlbWVudCB0eXBlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB4bWxUYWcgTmFtZSBvZiB0aGUgWE1MIHRhZyB0aGlzIHBpY2tlciB3aWxsIGhhbmRsZS5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKHhtbFRhZzogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICAgID0gRE9NLnJlcXVpcmUoYCMke3htbFRhZ31QaWNrZXJgKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0gICA9IERPTS5yZXF1aXJlKCdmb3JtJywgICB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIgPSBET00ucmVxdWlyZSgnaGVhZGVyJywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMueG1sVGFnICAgID0geG1sVGFnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jaGFuZ2UgID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmlucHV0ICAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uY2xpY2sgICA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25zdWJtaXQgID0gdGhpcy5vblN1Ym1pdC5iaW5kKHRoaXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIHdoZW4gZm9ybSBmaWVsZHMgY2hhbmdlLiBUaGUgaW1wbGVtZW50aW5nIHBpY2tlciBzaG91bGQgdXBkYXRlIGFsbCBsaW5rZWRcclxuICAgICAqIGVsZW1lbnRzIChlLmcuIG9mIHNhbWUgdHlwZSkgd2l0aCB0aGUgbmV3IGRhdGEgaGVyZS5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2hhbmdlKGV2OiBFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiBhIG1vdXNlIGNsaWNrIGhhcHBlbnMgYW55d2hlcmUgaW4gb3Igb24gdGhlIHBpY2tlcidzIGZvcm0gKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEga2V5IGlzIHByZXNzZWQgd2hpbHN0IHRoZSBwaWNrZXIncyBmb3JtIGlzIGZvY3VzZWQgKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBFTlRFUiBpcyBwcmVzc2VkIHdoaWxzdCBhIGZvcm0gY29udHJvbCBvZiB0aGUgcGlja2VyIGlzIGZvY3VzZWQuXHJcbiAgICAgKiBCeSBkZWZhdWx0LCB0aGlzIHdpbGwgdHJpZ2dlciB0aGUgb25DaGFuZ2UgaGFuZGxlciBhbmQgY2xvc2UgdGhlIGRpYWxvZy5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB0aGlzLm9uQ2hhbmdlKGV2KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVuIHRoaXMgcGlja2VyIGZvciBhIGdpdmVuIHBocmFzZSBlbGVtZW50LiBUaGUgaW1wbGVtZW50aW5nIHBpY2tlciBzaG91bGQgZmlsbFxyXG4gICAgICogaXRzIGZvcm0gZWxlbWVudHMgd2l0aCBkYXRhIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUgYW5kIHRhcmdldGVkIGVsZW1lbnQgaGVyZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSB0YXJnZXQgUGhyYXNlIGVsZW1lbnQgdGhhdCB0aGlzIHBpY2tlciBpcyBiZWluZyBvcGVuZWQgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyA9IHRhcmdldDtcclxuICAgICAgICB0aGlzLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvc2l0aW9ucyB0aGlzIHBpY2tlciByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IHBocmFzZSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgbGF5b3V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldFJlY3QgPSB0aGlzLmRvbUVkaXRpbmcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgbGV0IGZ1bGxXaWR0aCAgPSB0aGlzLmRvbS5jbGFzc0xpc3QuY29udGFpbnMoJ2Z1bGxXaWR0aCcpO1xyXG4gICAgICAgIGxldCBpc01vZGFsICAgID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbCcpO1xyXG4gICAgICAgIGxldCBkb2NXICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aDtcclxuICAgICAgICBsZXQgZG9jSCAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0O1xyXG4gICAgICAgIGxldCBkaWFsb2dYICAgID0gKHRhcmdldFJlY3QubGVmdCAgIHwgMCkgLSA4O1xyXG4gICAgICAgIGxldCBkaWFsb2dZICAgID0gIHRhcmdldFJlY3QuYm90dG9tIHwgMDtcclxuICAgICAgICBsZXQgZGlhbG9nVyAgICA9ICh0YXJnZXRSZWN0LndpZHRoICB8IDApICsgMTY7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiBob3Jpem9udGFsbHkgb2ZmIHNjcmVlblxyXG4gICAgICAgIGlmICghZnVsbFdpZHRoICYmICFpc01vZGFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9yY2UgZnVsbCB3aWR0aCBvbiBtb2JpbGVcclxuICAgICAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggPSBgMTAwJWA7XHJcblxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCAgICA9IGBpbml0aWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLm1pbldpZHRoID0gYCR7ZGlhbG9nV31weGA7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGRpYWxvZ1ggKyB0aGlzLmRvbS5vZmZzZXRXaWR0aCA+IGRvY1cpXHJcbiAgICAgICAgICAgICAgICAgICAgZGlhbG9nWCA9ICh0YXJnZXRSZWN0LnJpZ2h0IHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRXaWR0aCArIDg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaWNrZXJzIHRoYXQgaW5zdGVhZCB0YWtlIHVwIHRoZSB3aG9sZSBkaXNwbGF5LiBDU1MgaXNuJ3QgdXNlZCBoZXJlLFxyXG4gICAgICAgIC8vIGJlY2F1c2UgcGVyY2VudGFnZS1iYXNlZCBsZWZ0L3RvcCBjYXVzZXMgc3VicGl4ZWwgaXNzdWVzIG9uIENocm9tZS5cclxuICAgICAgICBpZiAoaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1ggPSBET00uaXNNb2JpbGUgPyAwIDogKCAoZG9jVyAqIDAuMSkgLyAyICkgfCAwO1xyXG4gICAgICAgICAgICBkaWFsb2dZID0gRE9NLmlzTW9iaWxlID8gMCA6ICggKGRvY0ggKiAwLjEpIC8gMiApIHwgMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50XHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSA8IDApXHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgdmVydGljYWxseSBvZmYgc2NyZWVuXHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dZID0gKHRhcmdldFJlY3QudG9wIHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgKyAxO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYmVsb3cnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJyk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBzdGlsbCBvZmYtc2NyZWVuLCBjbGFtcCB0byBib3R0b21cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgKyB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgPiBkb2NIKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IGRvY0ggLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICAvLyBDbGFtcCB0byB0b3AgZWRnZSBvZiBkb2N1bWVudC4gTGlrZWx5IGhhcHBlbnMgaWYgdGFyZ2V0IGVsZW1lbnQgaXMgbGFyZ2UuXHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYWJvdmUnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS5sZWZ0ID0gKGZ1bGxXaWR0aCA/IDAgOiBkaWFsb2dYKSArICdweCc7XHJcbiAgICAgICAgdGhpcy5kb20uc3R5bGUudG9wICA9IGRpYWxvZ1kgKyAncHgnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXR1cm5zIHRydWUgaWYgYW4gZWxlbWVudCBpbiB0aGlzIHBpY2tlciBjdXJyZW50bHkgaGFzIGZvY3VzICovXHJcbiAgICBwdWJsaWMgaGFzRm9jdXMoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uY29udGFpbnMoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGNvYWNoIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgQ29hY2hQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGxldHRlciBkcm9wLWRvd24gaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExldHRlciA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgY29hY2ggZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2NvYWNoJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgPSBET00ucmVxdWlyZSgnc2VsZWN0JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDI2OyBpKyspXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5pbnB1dExldHRlciwgTC5MRVRURVJTW2ldLCBMLkxFVFRFUlNbaV0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgdGFyZ2V0IGNvbnRleHQncyBjb2FjaCBsZXR0ZXIgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9DT0FDSCh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gUkFHLnN0YXRlLmdldENvYWNoKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBjb2FjaCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1jb2FjaF1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0TGV0dGVyLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGV4Y3VzZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIEV4Y3VzZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2V4Y3VzZScpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9FWENVU0U7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5leGN1c2VzLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBleGN1c2VcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgZXhjdXNlIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLmV4Y3VzZSA9IGVudHJ5LmlubmVyVGV4dDtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCgnZXhjdXNlJywgUkFHLnN0YXRlLmV4Y3VzZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGludGVnZXIgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBJbnRlZ2VyUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0IDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBvcHRpb25hbCBzdWZmaXggbGFiZWwgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGFiZWwgICA6IEhUTUxMYWJlbEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgc2luZ3VsYXIgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzaW5ndWxhcj8gIDogc3RyaW5nO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvcHRpb25hbCBwbHVyYWwgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBwbHVyYWw/ICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgd2FudHMgd29yZCBkaWdpdHMgKi9cclxuICAgIHByaXZhdGUgd29yZHM/ICAgICA6IGJvb2xlYW47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignaW50ZWdlcicpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21MYWJlbCAgID0gRE9NLnJlcXVpcmUoJ2xhYmVsJywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgaW50ZWdlciBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5zaW5ndWxhciAgID0gdGFyZ2V0LmRhdGFzZXRbJ3Npbmd1bGFyJ107XHJcbiAgICAgICAgdGhpcy5wbHVyYWwgICAgID0gdGFyZ2V0LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIHRoaXMud29yZHMgICAgICA9IFBhcnNlLmJvb2xlYW4odGFyZ2V0LmRhdGFzZXRbJ3dvcmRzJ10gfHwgJ2ZhbHNlJyk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKHRoaXMuc2luZ3VsYXIgJiYgdmFsdWUgPT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICBlbHNlIGlmICh0aGlzLnBsdXJhbCAmJiB2YWx1ZSAhPT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0lOVEVHRVIodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50Q3R4ID09PSAnY29hY2hlcycpIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0Lm1pbiA9ICcwJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0Lm1heCA9ICc2MCc7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnJlbW92ZUF0dHJpYnV0ZSgnbWluJyk7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5yZW1vdmVBdHRyaWJ1dGUoJ21heCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgICAgPSB2YWx1ZS50b1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBpbnRlZ2VyIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gQ2FuJ3QgdXNlIHZhbHVlQXNOdW1iZXIgZHVlIHRvIGlPUyBpbnB1dCB0eXBlIHdvcmthcm91bmRzXHJcbiAgICAgICAgbGV0IGludCAgICA9IHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTihpbnQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50Q3R4ID09PSAnY29hY2hlcycpIHtcclxuICAgICAgICAgICAgaWYgKGludCA8IDApIHsgaW50ID0gMDsgdGhpcy5pbnB1dERpZ2l0LnZhbHVlID0gJzAnOyB9XHJcbiAgICAgICAgICAgIGlmIChpbnQgPiA2MCkgeyBpbnQgPSA2MDsgdGhpcy5pbnB1dERpZ2l0LnZhbHVlID0gJzYwJzsgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGludFN0ciA9ICh0aGlzLndvcmRzKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSAnJztcclxuXHJcbiAgICAgICAgaWYgKGludCA9PT0gMSAmJiB0aGlzLnNpbmd1bGFyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnNpbmd1bGFyfWA7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHRoaXMucGx1cmFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnBsdXJhbH1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMucGx1cmFsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldEludGVnZXIodGhpcy5jdXJyZW50Q3R4LCBpbnQpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1pbnRlZ2VyXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IGludFN0cik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBuYW1lZCB0cmFpbiBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIE5hbWVkUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignbmFtZWQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfTkFNRUQ7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5uYW1lZC5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBuYW1lXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgbmFtZWQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUubmFtZWQgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ25hbWVkJywgUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlc2V0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGhyYXNlc2V0UGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSByZWZlcmVuY2UgdGFnIGZvciB0aGUgY3VycmVudCBwaHJhc2VzZXQgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFJlZiA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3BocmFzZXNldCcpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgcGhyYXNlc2V0J3MgbGlzdCBvZiBwaHJhc2VzICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIGxldCByZWYgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IGlkeCAgICAgICA9IHBhcnNlSW50KCBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnaWR4JykgKTtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gYXNzZXJ0KCBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZikhICk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFJlZiAgICAgICAgICA9IHJlZjtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLmNsZWFyKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIHBocmFzZSwgd2UgbmVlZCB0byBydW4gaXQgdGhyb3VnaCB0aGUgcGhyYXNlciB1c2luZyB0aGUgY3VycmVudCBzdGF0ZVxyXG4gICAgICAgIC8vIHRvIGdlbmVyYXRlIFwicHJldmlld3NcIiBvZiBob3cgdGhlIHBocmFzZSB3aWxsIGxvb2suXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGhyYXNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlc2V0LmNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50LCBwaHJhc2UpO1xyXG4gICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHBocmFzZSk7XHJcblxyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJUZXh0ICAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgICAgIHBocmFzZS5kYXRhc2V0LmlkeCA9IGkudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5hZGRSYXcocGhyYXNlLCBpID09PSBpZHgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHBocmFzZXNldCBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludChlbnRyeS5kYXRhc2V0WydpZHgnXSEpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0UGhyYXNlc2V0SWR4KHRoaXMuY3VycmVudFJlZiwgaWR4KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5yZWZyZXNoUGhyYXNlc2V0KHRoaXMuY3VycmVudFJlZik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBsYXRmb3JtIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGxhdGZvcm1QaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG51bWVyaWNhbCBpbnB1dCBzcGlubmVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlnaXQgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBsZXR0ZXIgZHJvcC1kb3duIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMZXR0ZXIgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdwbGF0Zm9ybScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgICAgICAgICAgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciAgICAgICAgID0gRE9NLnJlcXVpcmUoJ3NlbGVjdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QTEFURk9STTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgcGxhdGZvcm0gZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgPSB2YWx1ZVswXTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gdmFsdWVbMV07XHJcbiAgICAgICAgdGhpcy51cGRhdGVMZXR0ZXJWaXNpYmlsaXR5KCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHBsYXRmb3JtIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGludFZhbCA9IHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSk7XHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTiggaW50VmFsICkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIChpbnRWYWwgPCAwKSB7IGludFZhbCA9IDA7IHRoaXMuaW5wdXREaWdpdC52YWx1ZSA9ICcwJzsgfVxyXG4gICAgICAgIGlmIChpbnRWYWwgPiA2MCkgeyBpbnRWYWwgPSA2MDsgdGhpcy5pbnB1dERpZ2l0LnZhbHVlID0gJzYwJzsgfVxyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZUxldHRlclZpc2liaWxpdHkoKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnBsYXRmb3JtID0gW3RoaXMuaW5wdXREaWdpdC52YWx1ZSwgdGhpcy5pbnB1dExldHRlci52YWx1ZV07XHJcblxyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCAncGxhdGZvcm0nLCBSQUcuc3RhdGUucGxhdGZvcm0uam9pbignJykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGlkZXMgYW5kIGNsZWFycyB0aGUgbGV0dGVyIHNlbGVjdG9yIGlmIHBsYXRmb3JtIG51bWJlciBpcyA+IDI2ICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZUxldHRlclZpc2liaWxpdHkoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaW50VmFsID0gcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKTtcclxuICAgICAgICBsZXQgaGlkZSAgID0gaXNOYU4oaW50VmFsKSB8fCBpbnRWYWwgPiAyNjtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci5oaWRkZW4gICA9IGhpZGU7XHJcbiAgICAgICAgaWYgKGhpZGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlICAgID0gJyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2VydmljZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFNlcnZpY2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHNlcnZpY2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3NlcnZpY2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBzZXJ2aWNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU0VSVklDRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBzZXJ2aWNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdCggUkFHLnN0YXRlLmdldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc2VydmljZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCwgZW50cnkuaW5uZXJUZXh0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9c2VydmljZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvblBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgc2hhcmVkIHN0YXRpb24gY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGNob29zZXIgOiBTdGF0aW9uQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHN0YXRpb24gZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSBmb3IgU3RhdGlvblBpY2tlciBvciBmb3IgU3RhdGlvbkxpc3RQaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbk9wZW4gICAgIDogKHRhcmdldDogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHRhZzogc3RyaW5nID0gJ3N0YXRpb24nKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHRhZyk7XHJcblxyXG4gICAgICAgIGlmICghU3RhdGlvblBpY2tlci5jaG9vc2VyKVxyXG4gICAgICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIgPSBuZXcgU3RhdGlvbkNob29zZXIodGhpcy5kb21Gb3JtKTtcclxuXHJcbiAgICAgICAgdGhpcy5vbk9wZW4gPSB0aGlzLm9uU3RhdGlvblBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlyZXMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSByZWdpc3RlcmVkIGZvciB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG4gICAgICAgIHRoaXMub25PcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEF0dGFjaGVzIHRoZSBzdGF0aW9uIGNob29zZXIgYW5kIGZvY3VzZXMgaXQgb250byB0aGUgY3VycmVudCBlbGVtZW50J3Mgc3RhdGlvbiAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvblBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNob29zZXIgICAgID0gU3RhdGlvblBpY2tlci5jaG9vc2VyO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25TZWxlY3RTdGF0aW9uKTtcclxuICAgICAgICBjaG9vc2VyLnByZXNlbGVjdENvZGUoIFJBRy5zdGF0ZS5nZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgICAgICBjaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSB0cnVlO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIHN0YXRpb24gY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uQ2xpY2soZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uSW5wdXQoZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzdGF0aW9uIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0U3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSA9IGBbZGF0YS10eXBlPXN0YXRpb25dW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuICAgICAgICBsZXQgY29kZSAgPSBlbnRyeS5kYXRhc2V0Wydjb2RlJ10hO1xyXG4gICAgICAgIGxldCBuYW1lICA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgsIGNvZGUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gbmFtZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJzdGF0aW9uUGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vLi4vdmVuZG9yL2RyYWdnYWJsZS5kLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIGxpc3QgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdFBpY2tlciBleHRlbmRzIFN0YXRpb25QaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNvbnRhaW5lciBmb3IgdGhlIGxpc3QgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MaXN0ICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGFkZCBzdGF0aW9uIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5BZGQgICAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGNsb3NlIHBpY2tlciBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQ2xvc2UgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBkcm9wIHpvbmUgZm9yIGRlbGV0aW5nIHN0YXRpb24gZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRGVsICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhY3R1YWwgc29ydGFibGUgbGlzdCBvZiBzdGF0aW9ucyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExpc3QgICAgOiBIVE1MRExpc3RFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBwbGFjZWhvbGRlciBzaG93biBpZiB0aGUgbGlzdCBpcyBlbXB0eSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21FbXB0eUxpc3QgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKFwic3RhdGlvbmxpc3RcIik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGlzdCAgICAgID0gRE9NLnJlcXVpcmUoJy5zdGF0aW9uTGlzdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmJ0bkFkZCAgICAgICA9IERPTS5yZXF1aXJlKCcuYWRkU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuYnRuQ2xvc2UgICAgID0gRE9NLnJlcXVpcmUoJy5jbG9zZVBpY2tlcicsIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21EZWwgICAgICAgPSBET00ucmVxdWlyZSgnLmRlbFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdCAgICA9IERPTS5yZXF1aXJlKCdkbCcsICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0ID0gRE9NLnJlcXVpcmUoJ3AnLCAgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4gICAgICAgPSB0aGlzLm9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIG5ldyBEcmFnZ2FibGUuU29ydGFibGUoW3RoaXMuaW5wdXRMaXN0LCB0aGlzLmRvbURlbF0sIHsgZHJhZ2dhYmxlOiAnZGQnIH0pXHJcbiAgICAgICAgICAgIC8vIEhhdmUgdG8gdXNlIHRpbWVvdXQsIHRvIGxldCBEcmFnZ2FibGUgZmluaXNoIHNvcnRpbmcgdGhlIGxpc3RcclxuICAgICAgICAgICAgLm9uKCAnZHJhZzpzdG9wJywgZXYgPT4gc2V0VGltZW91dCgoKSA9PiB0aGlzLm9uRHJhZ1N0b3AoZXYpLCAxKSApXHJcbiAgICAgICAgICAgIC5vbiggJ21pcnJvcjpjcmVhdGUnLCB0aGlzLm9uRHJhZ01pcnJvckNyZWF0ZS5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQb3B1bGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLCB3aXRoIHRoZSBzZWxlY3RlZCBsaXN0LiBCZWNhdXNlIHRoaXMgcGlja2VyXHJcbiAgICAgKiBleHRlbmRzIGZyb20gU3RhdGlvbkxpc3QsIHRoaXMgaGFuZGxlciBvdmVycmlkZXMgdGhlICdvbk9wZW4nIGRlbGVnYXRlIHByb3BlcnR5XHJcbiAgICAgKiBvZiBTdGF0aW9uTGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IFN0YXRpb24gbGlzdCBlZGl0b3IgZWxlbWVudCB0byBvcGVuIGZvclxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uTGlzdFBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2luY2Ugd2Ugc2hhcmUgdGhlIHN0YXRpb24gcGlja2VyIHdpdGggU3RhdGlvbkxpc3QsIGdyYWIgaXRcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25BZGRTdGF0aW9uKTtcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuc2VsZWN0T25DbGljayA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBlbnRyaWVzICAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgpLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT05MSVNUKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBhbGwgb2xkIGxpc3QgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgLy8gRmluYWxseSwgcG9wdWxhdGUgbGlzdCBmcm9tIHRoZSBjbGlja2VkIHN0YXRpb24gbGlzdCBlbGVtZW50XHJcbiAgICAgICAgZW50cmllcy5mb3JFYWNoKCB2ID0+IHRoaXMuYWRkKHYpICk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkIHsgc3VwZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbkNsaWNrKGV2KTtcclxuXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5DbG9zZSlcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIC8vIEZvciBtb2JpbGUgdXNlcnMsIHN3aXRjaCB0byBzdGF0aW9uIGNob29zZXIgc2NyZWVuIGlmIFwiQWRkLi4uXCIgd2FzIGNsaWNrZWRcclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkFkZClcclxuICAgICAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGtleWJvYXJkIG5hdmlnYXRpb24gZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uSW5wdXQoZXYpO1xyXG5cclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciBjb250cm9sXHJcbiAgICAgICAgaWYgKCAhZm9jdXNlZCB8fCAhdGhpcy5pbnB1dExpc3QuY29udGFpbnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGZvY3VzZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW50cnkgZGVsZXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnRGVsZXRlJyB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9jdXMgb24gbmV4dCBlbGVtZW50IG9yIHBhcmVudCBvbiBkZWxldGVcclxuICAgICAgICAgICAgbGV0IG5leHQgPSBmb2N1c2VkLnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBmb2N1c2VkLm5leHRFbGVtZW50U2libGluZyAgICAgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCB0aGlzLmlucHV0TGlzdDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZvY3VzZWQpO1xyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVyIGZvciB3aGVuIGEgc3RhdGlvbiBpcyBjaG9zZW4gKi9cclxuICAgIHByaXZhdGUgb25BZGRTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gdGhpcy5hZGQoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIC8vIFN3aXRjaCBiYWNrIHRvIGJ1aWxkZXIgc2NyZWVuLCBpZiBvbiBtb2JpbGVcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgLy8gRm9jdXMgb25seSBpZiBvbiBtb2JpbGUsIHNpbmNlIHRoZSBzdGF0aW9uIGxpc3QgaXMgb24gYSBkZWRpY2F0ZWQgc2NyZWVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLmZvY3VzKCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uc2Nyb2xsSW50b1ZpZXcoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRml4ZXMgbWlycm9ycyBub3QgaGF2aW5nIGNvcnJlY3Qgd2lkdGggb2YgdGhlIHNvdXJjZSBlbGVtZW50LCBvbiBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgb25EcmFnTWlycm9yQ3JlYXRlKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5kYXRhLnNvdXJjZSEuc3R5bGUud2lkdGggPSBldi5kYXRhLm9yaWdpbmFsU291cmNlIS5jbGllbnRXaWR0aCArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgZHJhZ2dhYmxlIHN0YXRpb24gbmFtZSBiZWluZyBkcm9wcGVkICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ1N0b3AoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmRvbURlbClcclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgYWRkcyBhIG5ldyBlbnRyeSBmb3IgdGhlIGJ1aWxkZXIgbGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSBhbiBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFkZChjb2RlOiBzdHJpbmcpIDogU3RhdGlvbkxpc3RJdGVtXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gbmV3IFN0YXRpb25MaXN0SXRlbShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHRoZSBuZXcgZW50cnkgdG8gdGhlIHNvcnRhYmxlIGxpc3RcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5hcHBlbmRDaGlsZChuZXdFbnRyeS5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmhpZGRlbiA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIERpc2FibGUgdGhlIGFkZGVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZGlzYWJsZShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gRGVsZXRlIGl0ZW0gb24gZG91YmxlIGNsaWNrXHJcbiAgICAgICAgbmV3RW50cnkuZG9tLm9uZGJsY2xpY2sgPSBfID0+IHRoaXMucmVtb3ZlKG5ld0VudHJ5LmRvbSk7XHJcblxyXG4gICAgICAgIHJldHVybiBuZXdFbnRyeTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlbW92ZXMgdGhlIGdpdmVuIHN0YXRpb24gZW50cnkgZWxlbWVudCBmcm9tIHRoZSBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbnRyeSBFbGVtZW50IG9mIHRoZSBzdGF0aW9uIGVudHJ5IHRvIHJlbW92ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlbW92ZShlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICggIXRoaXMuZG9tTGlzdC5jb250YWlucyhlbnRyeSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcignQXR0ZW1wdGVkIHRvIHJlbW92ZSBlbnRyeSBub3Qgb24gc3RhdGlvbiBsaXN0IGJ1aWxkZXInKTtcclxuXHJcbiAgICAgICAgLy8gRW5hYmxlZCB0aGUgcmVtb3ZlZCBzdGF0aW9uIGluIHRoZSBjaG9vc2VyXHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmVuYWJsZShlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaGlsZHJlbiA9IHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCB1cGRhdGUgaWYgbGlzdCBpcyBlbXB0eVxyXG4gICAgICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGxpc3QgPSBbXTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBlbnRyeSA9IGNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgbGlzdC5wdXNoKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHRleHRMaXN0ID0gU3RyaW5ncy5mcm9tU3RhdGlvbkxpc3QobGlzdC5zbGljZSgpLCB0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIGxldCBxdWVyeSAgICA9IGBbZGF0YS10eXBlPXN0YXRpb25saXN0XVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWA7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgsIGxpc3QpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGV4dExpc3QpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0aW1lIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgVGltZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgdGltZSBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0VGltZTogSFRNTElucHV0RWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHRpbWUgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3RpbWUnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgdGltZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1RJTUUodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUudmFsdWUgPSBSQUcuc3RhdGUuZ2V0VGltZSh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHRpbWUgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUuc2V0VGltZSh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9dGltZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0VGltZS52YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQmFzZSBjbGFzcyBmb3IgY29uZmlndXJhdGlvbiBvYmplY3RzLCB0aGF0IGNhbiBzYXZlLCBsb2FkLCBhbmQgcmVzZXQgdGhlbXNlbHZlcyAqL1xyXG5hYnN0cmFjdCBjbGFzcyBDb25maWdCYXNlPFQgZXh0ZW5kcyBDb25maWdCYXNlPFQ+PlxyXG57XHJcbiAgICAvKiogbG9jYWxTdG9yYWdlIGtleSB3aGVyZSBjb25maWcgaXMgZXhwZWN0ZWQgdG8gYmUgc3RvcmVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVRUSU5HU19LRVkgOiBzdHJpbmcgPSAnc2V0dGluZ3MnO1xyXG5cclxuICAgIC8qKiBQcm90b3R5cGUgb2JqZWN0IGZvciBjcmVhdGluZyBuZXcgY29waWVzIG9mIHNlbGYgKi9cclxuICAgIHByaXZhdGUgdHlwZSA6IChuZXcgKCkgPT4gVCk7XHJcblxyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKCB0eXBlOiAobmV3ICgpID0+IFQpIClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnR5cGUgPSB0eXBlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgbG9hZHMgcnVudGltZSBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBsb2FkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHNldHRpbmdzID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKENvbmZpZ0Jhc2UuU0VUVElOR1NfS0VZKTtcclxuXHJcbiAgICAgICAgaWYgKCFzZXR0aW5ncylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjb25maWcgPSBKU09OLnBhcnNlKHNldHRpbmdzKTtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCBjb25maWcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZXJyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX0xPQURfRkFJTChlcnIubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IHNhdmVzIHRoaXMgY29uZmlndXJhdGlvbiB0byBsb2NhbFN0b3JhZ2UgKi9cclxuICAgIHB1YmxpYyBzYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oIENvbmZpZ0Jhc2UuU0VUVElOR1NfS0VZLCBKU09OLnN0cmluZ2lmeSh0aGlzKSApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZXJyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX1NBVkVfRkFJTChlcnIubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IGRlbGV0ZXMgdGhpcyBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyByZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbiggdGhpcywgbmV3IHRoaXMudHlwZSgpICk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShDb25maWdCYXNlLlNFVFRJTkdTX0tFWSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfUkVTRVRfRkFJTChlcnIubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwiY29uZmlnQmFzZS50c1wiLz5cclxuXHJcbi8qKiBIb2xkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZm9yIFJBRyAqL1xyXG5jbGFzcyBDb25maWcgZXh0ZW5kcyBDb25maWdCYXNlPENvbmZpZz5cclxue1xyXG4gICAgLyoqIElmIHVzZXIgaGFzIGNsaWNrZWQgc2h1ZmZsZSBhdCBsZWFzdCBvbmNlICovXHJcbiAgICBwdWJsaWMgY2xpY2tlZEdlbmVyYXRlIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIElmIHVzZXIgaGFzIHJlYWQgdGhlIGRpc2NsYWltZXIgKi9cclxuICAgIHB1YmxpYyByZWFkRGlzY2xhaW1lciAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogVm9sdW1lIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgc3BlZWNoVm9sICAgICAgIDogbnVtYmVyICA9IDEuMDtcclxuICAgIC8qKiBQaXRjaCBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljIHNwZWVjaFBpdGNoICAgICA6IG51bWJlciAgPSAxLjA7XHJcbiAgICAvKiogUmF0ZSBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljIHNwZWVjaFJhdGUgICAgICA6IG51bWJlciAgPSAxLjA7XHJcbiAgICAvKiogVk9YIGtleSBvZiB0aGUgY2hpbWUgdG8gdXNlIHByaW9yIHRvIHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgdm94Q2hpbWUgICAgICAgIDogc3RyaW5nICA9ICcnO1xyXG4gICAgLyoqIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCBvZiB0aGUgY3VzdG9tIFZPWCB2b2ljZSB0byB1c2UgKi9cclxuICAgIHB1YmxpYyB2b3hDdXN0b21QYXRoICAgOiBzdHJpbmcgID0gJyc7XHJcbiAgICAvKiogV2hldGhlciB0byB1c2UgdGhlIFZPWCBlbmdpbmUgKi9cclxuICAgIHB1YmxpYyB2b3hFbmFibGVkICAgICAgOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIC8qKiBSZWxhdGl2ZSBvciBhYnNvbHV0ZSBVUkwgb2YgdGhlIFZPWCB2b2ljZSB0byB1c2UgKi9cclxuICAgIHB1YmxpYyB2b3hQYXRoICAgICAgICAgOiBzdHJpbmcgID0gJ2h0dHBzOi8venp6LWNyZWF0b3IuZ2l0aHViLmlvL1JBRy1WT1gtUm95JztcclxuXHJcbiAgICAvKiogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UgYXMgdm9pY2UgbmFtZSwgb3IgJycgaWYgdW5zZXQgKi9cclxuICAgIHByaXZhdGUgX3NwZWVjaFZvaWNlIDogc3RyaW5nID0gJyc7XHJcbiAgICAvKiogSW1wdWxzZSByZXNwb25zZSB0byB1c2UgZm9yIFZPWCdzIHJldmVyYiAqL1xyXG4gICAgcHJpdmF0ZSBfdm94UmV2ZXJiICAgOiBzdHJpbmcgPSAnaXIuc3RhbGJhbnMud2F2JztcclxuXHJcbiAgICAvKipcclxuICAgICAqIENob2ljZSBvZiBzcGVlY2ggdm9pY2UgdG8gdXNlLCBhcyBhIHZvaWNlIG5hbWUuIEJlY2F1c2Ugb2YgdGhlIGFzeW5jIG5hdHVyZSBvZlxyXG4gICAgICogZ2V0Vm9pY2VzLCB0aGUgZGVmYXVsdCB2YWx1ZSB3aWxsIGJlIGZldGNoZWQgZnJvbSBpdCBlYWNoIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIGdldCBzcGVlY2hWb2ljZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBhIHVzZXItZGVmaW5lZCB2YWx1ZSwgdXNlIHRoYXRcclxuICAgICAgICBpZiAodGhpcy5fc3BlZWNoVm9pY2UgIT09ICcnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3BlZWNoVm9pY2U7XHJcblxyXG4gICAgICAgIC8vIFNlbGVjdCBFbmdsaXNoIHZvaWNlcyBieSBkZWZhdWx0XHJcbiAgICAgICAgbGV0IHZvaWNlcyA9IFJBRy5zcGVlY2guYnJvd3NlclZvaWNlcztcclxuXHJcbiAgICAgICAgZm9yIChsZXQgbmFtZSBpbiB2b2ljZXMpXHJcbiAgICAgICAgaWYgICh2b2ljZXNbbmFtZV0ubGFuZyA9PT0gJ2VuLUdCJyB8fCB2b2ljZXNbbmFtZV0ubGFuZyA9PT0gJ2VuLVVTJylcclxuICAgICAgICAgICAgcmV0dXJuIG5hbWU7XHJcblxyXG4gICAgICAgIC8vIEVsc2UsIGZpcnN0IHZvaWNlIG9uIHRoZSBsaXN0XHJcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHZvaWNlcylbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGNob2ljZSBvZiBzcGVlY2ggdG8gdXNlLCBhcyB2b2ljZSBuYW1lICovXHJcbiAgICBzZXQgc3BlZWNoVm9pY2UodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zcGVlY2hWb2ljZSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBpbXB1bHNlIHJlc3BvbnNlIGZpbGUgdG8gdXNlIGZvciBWT1ggZW5naW5lJ3MgcmV2ZXJiICovXHJcbiAgICBnZXQgdm94UmV2ZXJiKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICAvLyBSZXNldCBjaG9pY2Ugb2YgcmV2ZXJiIGlmIGl0J3MgaW52YWxpZFxyXG4gICAgICAgIGxldCBjaG9pY2VzID0gT2JqZWN0LmtleXMoVm94RW5naW5lLlJFVkVSQlMpO1xyXG5cclxuICAgICAgICBpZiAoICFjaG9pY2VzLmluY2x1ZGVzKHRoaXMuX3ZveFJldmVyYikgKVxyXG4gICAgICAgICAgICB0aGlzLl92b3hSZXZlcmIgPSBjaG9pY2VzWzBdO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5fdm94UmV2ZXJiO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBpbXB1bHNlIHJlc3BvbnNlIGZpbGUgdG8gdXNlIGZvciBWT1ggZW5naW5lJ3MgcmV2ZXJiICovXHJcbiAgICBzZXQgdm94UmV2ZXJiKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fdm94UmV2ZXJiID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGF1dG9Mb2FkOiBib29sZWFuID0gZmFsc2UpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoQ29uZmlnKTtcclxuXHJcbiAgICAgICAgaWYgKGF1dG9Mb2FkKVxyXG4gICAgICAgICAgICB0aGlzLmxvYWQoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIExhbmd1YWdlIGVudHJpZXMgYXJlIHRlbXBsYXRlIGRlbGVnYXRlcyAqL1xyXG50eXBlIExhbmd1YWdlRW50cnkgPSAoLi4ucGFydHM6IHN0cmluZ1tdKSA9PiBzdHJpbmc7XHJcblxyXG4vKiogTGFuZ3VhZ2UgZGVmaW5pdGlvbnMgZm9yIEVuZ2xpc2g7IGFsc28gYWN0cyBhcyB0aGUgYmFzZSBsYW5ndWFnZSAqL1xyXG5jbGFzcyBFbmdsaXNoTGFuZ3VhZ2Vcclxue1xyXG4gICAgW2luZGV4OiBzdHJpbmddIDogTGFuZ3VhZ2VFbnRyeSB8IHN0cmluZyB8IHN0cmluZ1tdO1xyXG5cclxuICAgIC8vIFJBR1xyXG5cclxuICAgIFdFTENPTUUgICAgICAgPSAnV2VsY29tZSB0byBSYWlsIEFubm91bmNlbWVudCBHZW5lcmF0b3IuJztcclxuICAgIERPTV9NSVNTSU5HICAgPSAocTogYW55KSA9PiBgUmVxdWlyZWQgRE9NIGVsZW1lbnQgaXMgbWlzc2luZzogJyR7cX0nYDtcclxuICAgIEFUVFJfTUlTU0lORyAgPSAoYTogYW55KSA9PiBgUmVxdWlyZWQgYXR0cmlidXRlIGlzIG1pc3Npbmc6ICcke2F9J2A7XHJcbiAgICBEQVRBX01JU1NJTkcgID0gKGs6IGFueSkgPT4gYFJlcXVpcmVkIGRhdGFzZXQga2V5IGlzIG1pc3Npbmcgb3IgZW1wdHk6ICcke2t9J2A7XHJcbiAgICBCQURfRElSRUNUSU9OID0gKHY6IGFueSkgPT4gYERpcmVjdGlvbiBuZWVkcyB0byBiZSAtMSBvciAxLCBub3QgJyR7dn0nYDtcclxuICAgIEJBRF9CT09MRUFOICAgPSAodjogYW55KSA9PiBgR2l2ZW4gc3RyaW5nIGRvZXMgbm90IHJlcHJlc2VudCBhIGJvb2xlYW46ICcke3Z9J2A7XHJcblxyXG4gICAgLy8gU3RhdGVcclxuXHJcbiAgICBTVEFURV9GUk9NX1NUT1JBR0UgID0gJ1N0YXRlIGhhcyBiZWVuIGxvYWRlZCBmcm9tIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX1RPX1NUT1JBR0UgICAgPSAnU3RhdGUgaGFzIGJlZW4gc2F2ZWQgdG8gc3RvcmFnZSwgYW5kIGR1bXBlZCB0byBjb25zb2xlLic7XHJcbiAgICBTVEFURV9DT1BZX1BBU1RFICAgID0gJyVjQ29weSBhbmQgcGFzdGUgdGhpcyBpbiBjb25zb2xlIHRvIGxvYWQgbGF0ZXI6JztcclxuICAgIFNUQVRFX1JBV19KU09OICAgICAgPSAnJWNSYXcgSlNPTiBzdGF0ZTonO1xyXG4gICAgU1RBVEVfU0FWRV9NSVNTSU5HICA9ICdTb3JyeSwgbm8gc3RhdGUgd2FzIGZvdW5kIGluIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX1NBVkVfRkFJTCAgICAgPSAobXNnOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFNvcnJ5LCBzdGF0ZSBjb3VsZCBub3QgYmUgc2F2ZWQgdG8gc3RvcmFnZTogJHttc2d9YDtcclxuICAgIFNUQVRFX0JBRF9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBBdHRlbXB0ZWQgdG8gZ2V0IGNob3NlbiBpbmRleCBmb3IgcGhyYXNlc2V0ICgke3J9KSB0aGF0IGRvZXNuJ3QgZXhpc3QuYDtcclxuXHJcbiAgICAvLyBDb25maWdcclxuXHJcbiAgICBDT05GSUdfTE9BRF9GQUlMICA9IChtc2c6IGFueSkgPT4gYENvdWxkIG5vdCBsb2FkIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1NBVkVfRkFJTCAgPSAobXNnOiBhbnkpID0+IGBDb3VsZCBub3Qgc2F2ZSBzZXR0aW5nczogJHttc2d9YDtcclxuICAgIENPTkZJR19SRVNFVF9GQUlMID0gKG1zZzogYW55KSA9PiBgQ291bGQgbm90IGNsZWFyIHNldHRpbmdzOiAke21zZ31gO1xyXG5cclxuICAgIC8vIERhdGFiYXNlXHJcblxyXG4gICAgREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRSA9IChlOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENvbmZpZ3VyZWQgcGhyYXNlc2V0IGVsZW1lbnQgcXVlcnkgJyR7ZX0nIGRvZXMgbm90IHBvaW50IHRvIGFuIGlmcmFtZSBlbWJlZC5gO1xyXG5cclxuICAgIERCX1VOS05PV05fU1RBVElPTiAgID0gKGM6IGFueSkgPT4gYFVOS05PV04gU1RBVElPTjogJHtjfWA7XHJcbiAgICBEQl9FTVBUWV9TVEFUSU9OICAgICA9IChjOiBhbnkpID0+XHJcbiAgICAgICAgYFN0YXRpb24gZGF0YWJhc2UgYXBwZWFycyB0byBjb250YWluIGFuIGVtcHR5IG5hbWUgZm9yIGNvZGUgJyR7Y30nLmA7XHJcbiAgICBEQl9UT09fTUFOWV9TVEFUSU9OUyA9ICgpID0+ICdQaWNraW5nIHRvbyBtYW55IHN0YXRpb25zIHRoYW4gdGhlcmUgYXJlIGF2YWlsYWJsZSc7XHJcblxyXG4gICAgLy8gVG9vbGJhclxyXG5cclxuICAgIFRPT0xCQVJfUExBWSAgICAgPSAnUGxheSBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TVE9QICAgICA9ICdTdG9wIHBsYXlpbmcgcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0hVRkZMRSAgPSAnR2VuZXJhdGUgcmFuZG9tIHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NBVkUgICAgID0gJ1NhdmUgc3RhdGUgdG8gc3RvcmFnZSc7XHJcbiAgICBUT09MQkFSX0xPQUQgICAgID0gJ1JlY2FsbCBzdGF0ZSBmcm9tIHN0b3JhZ2UnO1xyXG4gICAgVE9PTEJBUl9TRVRUSU5HUyA9ICdPcGVuIHNldHRpbmdzJztcclxuXHJcbiAgICAvLyBFZGl0b3JcclxuXHJcbiAgICBUSVRMRV9DT0FDSCAgICAgICA9IChjOiBhbnkpID0+IGBDbGljayB0byBjaGFuZ2UgdGhpcyBjb2FjaCAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9FWENVU0UgICAgICA9ICdDbGljayB0byBjaGFuZ2UgdGhpcyBleGN1c2UnO1xyXG4gICAgVElUTEVfSU5URUdFUiAgICAgPSAoYzogYW55KSA9PiBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgbnVtYmVyICgnJHtjfScpYDtcclxuICAgIFRJVExFX05BTUVEICAgICAgID0gJ0NsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluXFwncyBuYW1lJztcclxuICAgIFRJVExFX09QVF9PUEVOICAgID0gKHQ6IGFueSwgcjogYW55KSA9PlxyXG4gICAgICAgIGBDbGljayB0byBvcGVuIHRoaXMgb3B0aW9uYWwgJHt0fSAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9PUFRfQ0xPU0UgICA9ICh0OiBhbnksIHI6IGFueSkgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2xvc2UgdGhpcyBvcHRpb25hbCAke3R9ICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BIUkFTRVNFVCAgID0gKHI6IGFueSkgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoZSBwaHJhc2UgdXNlZCBpbiB0aGlzIHNlY3Rpb24gKCcke3J9JylgO1xyXG4gICAgVElUTEVfUExBVEZPUk0gICAgPSAnQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW5cXCdzIHBsYXRmb3JtJztcclxuICAgIFRJVExFX1NFUlZJQ0UgICAgID0gKGM6IGFueSkgPT4gYENsaWNrIHRvIGNoYW5nZSB0aGlzIHNlcnZpY2UgKCcke2N9JylgO1xyXG4gICAgVElUTEVfU1RBVElPTiAgICAgPSAoYzogYW55KSA9PiBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc3RhdGlvbiAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OTElTVCA9IChjOiBhbnkpID0+IGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uIGxpc3QgKCcke2N9JylgO1xyXG4gICAgVElUTEVfVElNRSAgICAgICAgPSAoYzogYW55KSA9PiBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdGltZSAoJyR7Y30nKWA7XHJcblxyXG4gICAgRURJVE9SX0lOSVQgICAgICAgICAgICAgID0gJ1BsZWFzZSB3YWl0Li4uJztcclxuICAgIEVESVRPUl9VTktOT1dOX0VMRU1FTlQgICA9IChuOiBhbnkpID0+IGAoVU5LTk9XTiBYTUwgRUxFTUVOVDogJHtufSlgO1xyXG4gICAgRURJVE9SX1VOS05PV05fUEhSQVNFICAgID0gKHI6IGFueSkgPT4gYChVTktOT1dOIFBIUkFTRTogJHtyfSlgO1xyXG4gICAgRURJVE9SX1VOS05PV05fUEhSQVNFU0VUID0gKHI6IGFueSkgPT4gYChVTktOT1dOIFBIUkFTRVNFVDogJHtyfSlgO1xyXG5cclxuICAgIC8vIFBocmFzZXJcclxuXHJcbiAgICBQSFJBU0VSX1RPT19SRUNVUlNJVkUgPSAnVG9vIG1hbnkgbGV2ZWxzIG9mIHJlY3Vyc2lvbiB3aGlsc3QgcHJvY2Vzc2luZyBwaHJhc2UuJztcclxuXHJcbiAgICAvLyBQaWNrZXJzXHJcblxyXG4gICAgSEVBREVSX0NPQUNIICAgICAgID0gKGM6IGFueSkgPT4gYFBpY2sgYSBjb2FjaCBsZXR0ZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfRVhDVVNFICAgICAgPSAnUGljayBhbiBleGN1c2UnO1xyXG4gICAgSEVBREVSX0lOVEVHRVIgICAgID0gKGM6IGFueSkgPT4gYFBpY2sgYSBudW1iZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfTkFNRUQgICAgICAgPSAnUGljayBhIG5hbWVkIHRyYWluJztcclxuICAgIEhFQURFUl9QSFJBU0VTRVQgICA9IChyOiBhbnkpID0+IGBQaWNrIGEgcGhyYXNlIGZvciB0aGUgJyR7cn0nIHNlY3Rpb25gO1xyXG4gICAgSEVBREVSX1BMQVRGT1JNICAgID0gJ1BpY2sgYSBwbGF0Zm9ybSc7XHJcbiAgICBIRUFERVJfU0VSVklDRSAgICAgPSAoYzogYW55KSA9PiBgUGljayBhIHNlcnZpY2UgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfU1RBVElPTiAgICAgPSAoYzogYW55KSA9PiBgUGljayBhIHN0YXRpb24gZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfU1RBVElPTkxJU1QgPSAoYzogYW55KSA9PiBgQnVpbGQgYSBzdGF0aW9uIGxpc3QgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfVElNRSAgICAgICAgPSAoYzogYW55KSA9PiBgUGljayBhIHRpbWUgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcblxyXG4gICAgUF9HRU5FUklDX1QgICAgICA9ICdMaXN0IG9mIGNob2ljZXMnO1xyXG4gICAgUF9HRU5FUklDX1BIICAgICA9ICdGaWx0ZXIgY2hvaWNlcy4uLic7XHJcbiAgICBQX0NPQUNIX1QgICAgICAgID0gJ0NvYWNoIGxldHRlcic7XHJcbiAgICBQX0VYQ1VTRV9UICAgICAgID0gJ0xpc3Qgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMnO1xyXG4gICAgUF9FWENVU0VfUEggICAgICA9ICdGaWx0ZXIgZXhjdXNlcy4uLic7XHJcbiAgICBQX0VYQ1VTRV9JVEVNX1QgID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGV4Y3VzZSc7XHJcbiAgICBQX0lOVF9UICAgICAgICAgID0gJ0ludGVnZXIgdmFsdWUnO1xyXG4gICAgUF9OQU1FRF9UICAgICAgICA9ICdMaXN0IG9mIHRyYWluIG5hbWVzJztcclxuICAgIFBfTkFNRURfUEggICAgICAgPSAnRmlsdGVyIHRyYWluIG5hbWUuLi4nO1xyXG4gICAgUF9OQU1FRF9JVEVNX1QgICA9ICdDbGljayB0byBzZWxlY3QgdGhpcyBuYW1lJztcclxuICAgIFBfUFNFVF9UICAgICAgICAgPSAnTGlzdCBvZiBwaHJhc2VzJztcclxuICAgIFBfUFNFVF9QSCAgICAgICAgPSAnRmlsdGVyIHBocmFzZXMuLi4nO1xyXG4gICAgUF9QU0VUX0lURU1fVCAgICA9ICdDbGljayB0byBzZWxlY3QgdGhpcyBwaHJhc2UnO1xyXG4gICAgUF9QTEFUX05VTUJFUl9UICA9ICdQbGF0Zm9ybSBudW1iZXInO1xyXG4gICAgUF9QTEFUX0xFVFRFUl9UICA9ICdPcHRpb25hbCBwbGF0Zm9ybSBsZXR0ZXInO1xyXG4gICAgUF9TRVJWX1QgICAgICAgICA9ICdMaXN0IG9mIHNlcnZpY2UgbmFtZXMnO1xyXG4gICAgUF9TRVJWX1BIICAgICAgICA9ICdGaWx0ZXIgc2VydmljZXMuLi4nO1xyXG4gICAgUF9TRVJWX0lURU1fVCAgICA9ICdDbGljayB0byBzZWxlY3QgdGhpcyBzZXJ2aWNlJztcclxuICAgIFBfU1RBVElPTl9UICAgICAgPSAnTGlzdCBvZiBzdGF0aW9uIG5hbWVzJztcclxuICAgIFBfU1RBVElPTl9QSCAgICAgPSAnRmlsdGVyIHN0YXRpb25zLi4uJztcclxuICAgIFBfU1RBVElPTl9JVEVNX1QgPSAnQ2xpY2sgdG8gc2VsZWN0IG9yIGFkZCB0aGlzIHN0YXRpb24nO1xyXG4gICAgUF9TTF9BREQgICAgICAgICA9ICdBZGQgc3RhdGlvbi4uLic7XHJcbiAgICBQX1NMX0FERF9UICAgICAgID0gJ0FkZCBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0NMT1NFICAgICAgID0gJ0Nsb3NlJztcclxuICAgIFBfU0xfQ0xPU0VfVCAgICAgPSAnQ2xvc2UgdGhpcyBwaWNrZXInO1xyXG4gICAgUF9TTF9FTVBUWSAgICAgICA9ICdQbGVhc2UgYWRkIGF0IGxlYXN0IG9uZSBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RSQUdfVCAgICAgID0gJ0RyYWdnYWJsZSBzZWxlY3Rpb24gb2Ygc3RhdGlvbnMgZm9yIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RFTEVURSAgICAgID0gJ0Ryb3AgaGVyZSB0byBkZWxldGUnO1xyXG4gICAgUF9TTF9ERUxFVEVfVCAgICA9ICdEcm9wIHN0YXRpb24gaGVyZSB0byBkZWxldGUgaXQgZnJvbSB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9JVEVNX1QgICAgICA9ICdEcmFnIHRvIHJlb3JkZXI7IGRvdWJsZS1jbGljayBvciBkcmFnIGludG8gZGVsZXRlIHpvbmUgdG8gcmVtb3ZlJztcclxuICAgIFBfVElNRV9UICAgICAgICAgPSAnVGltZSBlZGl0b3InO1xyXG5cclxuICAgIC8vIFNldHRpbmdzXHJcblxyXG4gICAgU1RfUkVTRVQgICAgICAgICAgID0gJ1Jlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX1QgICAgICAgICA9ICdSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNICAgPSAnQXJlIHlvdSBzdXJlPyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNX1QgPSAnQ29uZmlybSByZXNldCB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9ET05FICAgICAgPSAnU2V0dGluZ3MgaGF2ZSBiZWVuIHJlc2V0IHRvIHRoZWlyIGRlZmF1bHRzLCBhbmQgZGVsZXRlZCBmcm9tJyArXHJcbiAgICAgICAgJyBzdG9yYWdlLic7XHJcbiAgICBTVF9TQVZFICAgICAgICAgICAgPSAnU2F2ZSAmIGNsb3NlJztcclxuICAgIFNUX1NBVkVfVCAgICAgICAgICA9ICdTYXZlIGFuZCBjbG9zZSBzZXR0aW5ncyc7XHJcbiAgICBTVF9TUEVFQ0ggICAgICAgICAgPSAnU3BlZWNoJztcclxuICAgIFNUX1NQRUVDSF9DSE9JQ0UgICA9ICdWb2ljZSc7XHJcbiAgICBTVF9TUEVFQ0hfRU1QVFkgICAgPSAnTm9uZSBhdmFpbGFibGUnO1xyXG4gICAgU1RfU1BFRUNIX1ZPTCAgICAgID0gJ1ZvbHVtZSc7XHJcbiAgICBTVF9TUEVFQ0hfUElUQ0ggICAgPSAnUGl0Y2gnO1xyXG4gICAgU1RfU1BFRUNIX1JBVEUgICAgID0gJ1JhdGUnO1xyXG4gICAgU1RfU1BFRUNIX1RFU1QgICAgID0gJ1Rlc3Qgc3BlZWNoJztcclxuICAgIFNUX1NQRUVDSF9URVNUX1QgICA9ICdQbGF5IGEgc3BlZWNoIHNhbXBsZSB3aXRoIHRoZSBjdXJyZW50IHNldHRpbmdzJztcclxuICAgIFNUX0xFR0FMICAgICAgICAgICA9ICdMZWdhbCAmIEFja25vd2xlZGdlbWVudHMnO1xyXG5cclxuICAgIFdBUk5fU0hPUlRfSEVBREVSID0gJ1wiTWF5IEkgaGF2ZSB5b3VyIGF0dGVudGlvbiBwbGVhc2UuLi5cIic7XHJcbiAgICBXQVJOX1NIT1JUICAgICAgICA9ICdUaGlzIGRpc3BsYXkgaXMgdG9vIHNob3J0IHRvIHN1cHBvcnQgUkFHLiBQbGVhc2UgbWFrZSB0aGlzJyArXHJcbiAgICAgICAgJyB3aW5kb3cgdGFsbGVyLCBvciByb3RhdGUgeW91ciBkZXZpY2UgZnJvbSBsYW5kc2NhcGUgdG8gcG9ydHJhaXQuJztcclxuXHJcbiAgICAvLyBUT0RPOiBUaGVzZSBkb24ndCBmaXQgaGVyZTsgdGhpcyBzaG91bGQgZ28gaW4gdGhlIGRhdGFcclxuICAgIExFVFRFUlMgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVonO1xyXG4gICAgRElHSVRTICA9IFtcclxuICAgICAgICAnemVybycsICAgICAnb25lJywgICAgICd0d28nLCAgICAgJ3RocmVlJywgICAgICdmb3VyJywgICAgICdmaXZlJywgICAgJ3NpeCcsXHJcbiAgICAgICAgJ3NldmVuJywgICAgJ2VpZ2h0JywgICAnbmluZScsICAgICd0ZW4nLCAgICAgICAnZWxldmVuJywgICAndHdlbHZlJywgICd0aGlydGVlbicsXHJcbiAgICAgICAgJ2ZvdXJ0ZWVuJywgJ2ZpZnRlZW4nLCAnc2l4dGVlbicsICdzZXZlbnRlZW4nLCAnZWlnaHRlZW4nLCAnbmludGVlbicsICd0d2VudHknXHJcbiAgICBdO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSG9sZHMgbWV0aG9kcyBmb3IgcHJvY2Vzc2luZyBlYWNoIHR5cGUgb2YgcGhyYXNlIGVsZW1lbnQgaW50byBIVE1MLCB3aXRoIGRhdGEgdGFrZW5cclxuICogZnJvbSB0aGUgY3VycmVudCBzdGF0ZS4gRWFjaCBtZXRob2QgdGFrZXMgYSBjb250ZXh0IG9iamVjdCwgaG9sZGluZyBkYXRhIGZvciB0aGVcclxuICogY3VycmVudCBYTUwgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgYW5kIHRoZSBYTUwgZG9jdW1lbnQgYmVpbmcgdXNlZC5cclxuICovXHJcbmNsYXNzIEVsZW1lbnRQcm9jZXNzb3JzXHJcbntcclxuICAgIC8qKiBGaWxscyBpbiBjb2FjaCBsZXR0ZXJzIGZyb20gQSB0byBaICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvYWNoKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0NPQUNIKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldENvYWNoKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGV4Y3VzZSwgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGV4Y3VzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0VYQ1VTRTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5leGN1c2U7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBpbnRlZ2Vycywgb3B0aW9uYWxseSB3aXRoIG5vdW5zIGFuZCBpbiB3b3JkIGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50ZWdlcihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnc2luZ3VsYXInKTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsdXJhbCcpO1xyXG4gICAgICAgIGxldCB3b3JkcyAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnd29yZHMnKTtcclxuXHJcbiAgICAgICAgbGV0IGludCAgICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGNvbnRleHQpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAod29yZHMgJiYgd29yZHMudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoaW50ID09PSAxICYmIHNpbmd1bGFyKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3Npbmd1bGFyfWA7XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHBsdXJhbClcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtwbHVyYWx9YDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0lOVEVHRVIoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHI7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG5cclxuICAgICAgICBpZiAoc2luZ3VsYXIpIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ10gPSBzaW5ndWxhcjtcclxuICAgICAgICBpZiAocGx1cmFsKSAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddICAgPSBwbHVyYWw7XHJcbiAgICAgICAgaWYgKHdvcmRzKSAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wyd3b3JkcyddICAgID0gd29yZHM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBuYW1lZChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX05BTUVEO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLm5hbWVkO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlLCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZShyZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9ICcnO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0UocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmFwcGVuZENoaWxkKCBFbGVtZW50UHJvY2Vzc29ycy53cmFwVG9Jbm5lcihwaHJhc2UpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcGhyYXNlIGZyb20gYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlc2V0LCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VzZXQoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG4gICAgICAgIGxldCBmb3JjZWRJZHggPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkeCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFU0VUKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBpZHggPSBmb3JjZWRJZHhcclxuICAgICAgICAgICAgPyBwYXJzZUludChmb3JjZWRJZHgpXHJcbiAgICAgICAgICAgIDogUkFHLnN0YXRlLmdldFBocmFzZXNldElkeChyZWYpO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlID0gcGhyYXNlc2V0LmNoaWxkcmVuW2lkeF0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2lkeCddID0gZm9yY2VkSWR4IHx8IGlkeC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGhyYXNlc2V0cyB3aXRoIGEgY2hhbmNlIHZhbHVlIGFzIGNvbGxhcHNpYmxlXHJcbiAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQoIEVsZW1lbnRQcm9jZXNzb3JzLndyYXBUb0lubmVyKHBocmFzZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGxhdGZvcm0oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9QTEFURk9STTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5wbGF0Zm9ybS5qb2luKCcnKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSByYWlsIG5ldHdvcmsgbmFtZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzZXJ2aWNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NFUlZJQ0UoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0U2VydmljZShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHN0YXRpb24gbmFtZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGlvbihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IGNvZGUgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbihjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT04oY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHN0YXRpb24gbGlzdHMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGlvbmxpc3QoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgc3RhdGlvbnMgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbkxpc3QoY29udGV4dCkuc2xpY2UoKTtcclxuICAgICAgICBsZXQgc3RhdGlvbkxpc3QgPSBTdHJpbmdzLmZyb21TdGF0aW9uTGlzdChzdGF0aW9ucywgY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OTElTVChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IHN0YXRpb25MaXN0O1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIHRpbWUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdGltZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9USU1FKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldFRpbWUoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB2b3ggcGFydHMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdm94KGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAna2V5Jyk7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExvY2FsaXplXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgICAgPSBjdHgueG1sRWxlbWVudC50ZXh0Q29udGVudDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9IGBDbGljayB0byBlZGl0IHRoaXMgcGhyYXNlICgke2tleX0pYDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICAgICA9IDE7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsna2V5J10gPSBrZXk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdW5rbm93biBlbGVtZW50cyB3aXRoIGFuIGlubGluZSBlcnJvciBtZXNzYWdlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHVua25vd24oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBuYW1lID0gY3R4LnhtbEVsZW1lbnQubm9kZU5hbWU7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9FTEVNRU5UKG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXR0YWNoZXMgY2hhbmNlIGFuZCBhIHByZS1kZXRlcm1pbmVkIGNvbGxhcHNlIHN0YXRlIGZvciBhIGdpdmVuIHBocmFzZSBlbGVtZW50LCBpZlxyXG4gICAgICogaXQgZG9lcyBoYXZlIGEgY2hhbmNlIGF0dHJpYnVlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjdHggQ29udGV4dCBvZiB0aGUgY3VycmVudCBwaHJhc2UgZWxlbWVudCBiZWluZyBwcm9jZXNzZWRcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIGdldCAob3IgcGljaykgdGhlIGNvbGxhcHNlIHN0YXRlIG9mXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG1ha2VDb2xsYXBzaWJsZShjdHg6IFBocmFzZUNvbnRleHQsIHJlZjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoICFjdHgueG1sRWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2NoYW5jZScpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgY2hhbmNlICAgID0gY3R4LnhtbEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdjaGFuY2UnKSE7XHJcbiAgICAgICAgbGV0IGNvbGxhcHNlZCA9IFJBRy5zdGF0ZS5nZXRDb2xsYXBzZWQoIHJlZiwgcGFyc2VJbnQoY2hhbmNlKSApO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydjaGFuY2UnXSA9IGNoYW5jZTtcclxuXHJcbiAgICAgICAgQ29sbGFwc2libGVzLnNldChjdHgubmV3RWxlbWVudCwgY29sbGFwc2VkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsb25lcyB0aGUgY2hpbGRyZW4gb2YgdGhlIGdpdmVuIGVsZW1lbnQgaW50byBhIG5ldyBpbm5lciBzcGFuIHRhZywgc28gdGhhdCB0aGV5XHJcbiAgICAgKiBjYW4gYmUgbWFkZSBjb2xsYXBzaWJsZSBvciBidW5kbGVkIHdpdGggYnV0dG9ucy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc291cmNlIFBhcmVudCB0byBjbG9uZSB0aGUgY2hpbGRyZW4gb2YsIGludG8gYSB3cmFwcGVyXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHdyYXBUb0lubmVyKHNvdXJjZTogSFRNTEVsZW1lbnQpIDogSFRNTEVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICBsZXQgaW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblxyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoJ2lubmVyJyk7XHJcbiAgICAgICAgRE9NLmNsb25lSW50byhzb3VyY2UsIGlubmVyKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlubmVyO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogUmVwcmVzZW50cyBjb250ZXh0IGRhdGEgZm9yIGEgcGhyYXNlLCB0byBiZSBwYXNzZWQgdG8gYW4gZWxlbWVudCBwcm9jZXNzb3IgKi9cclxuaW50ZXJmYWNlIFBocmFzZUNvbnRleHRcclxue1xyXG4gICAgLyoqIEdldHMgdGhlIFhNTCBwaHJhc2UgZWxlbWVudCB0aGF0IGlzIGJlaW5nIHJlcGxhY2VkICovXHJcbiAgICB4bWxFbGVtZW50IDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogR2V0cyB0aGUgSFRNTCBzcGFuIGVsZW1lbnQgdGhhdCBpcyByZXBsYWNpbmcgdGhlIFhNTCBlbGVtZW50ICovXHJcbiAgICBuZXdFbGVtZW50IDogSFRNTFNwYW5FbGVtZW50O1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSGFuZGxlcyB0aGUgdHJhbnNmb3JtYXRpb24gb2YgcGhyYXNlIFhNTCBkYXRhLCBpbnRvIEhUTUwgZWxlbWVudHMgd2l0aCB0aGVpciBkYXRhXHJcbiAqIGZpbGxlZCBpbiBhbmQgdGhlaXIgVUkgbG9naWMgd2lyZWQuXHJcbiAqL1xyXG5jbGFzcyBQaHJhc2VyXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUmVjdXJzaXZlbHkgcHJvY2Vzc2VzIFhNTCBlbGVtZW50cywgZmlsbGluZyBpbiBkYXRhIGFuZCBhcHBseWluZyB0cmFuc2Zvcm1zLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250YWluZXIgUGFyZW50IHRvIHByb2Nlc3MgdGhlIGNoaWxkcmVuIG9mXHJcbiAgICAgKiBAcGFyYW0gbGV2ZWwgQ3VycmVudCBsZXZlbCBvZiByZWN1cnNpb24sIG1heC4gMjBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHByb2Nlc3MoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgbGV2ZWw6IG51bWJlciA9IDApXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSW5pdGlhbGx5LCB0aGlzIG1ldGhvZCB3YXMgc3VwcG9zZWQgdG8ganVzdCBhZGQgdGhlIFhNTCBlbGVtZW50cyBkaXJlY3RseSBpbnRvXHJcbiAgICAgICAgLy8gdGhlIGRvY3VtZW50LiBIb3dldmVyLCB0aGlzIGNhdXNlZCBhIGxvdCBvZiBwcm9ibGVtcyAoZS5nLiB0aXRsZSBub3Qgd29ya2luZykuXHJcbiAgICAgICAgLy8gSFRNTCBkb2VzIG5vdCB3b3JrIHJlYWxseSB3ZWxsIHdpdGggY3VzdG9tIGVsZW1lbnRzLCBlc3BlY2lhbGx5IGlmIHRoZXkgYXJlIG9mXHJcbiAgICAgICAgLy8gYW5vdGhlciBYTUwgbmFtZXNwYWNlLlxyXG5cclxuICAgICAgICBsZXQgcXVlcnkgICA9ICc6bm90KHNwYW4pOm5vdChzdmcpOm5vdCh1c2UpOm5vdChidXR0b24pJztcclxuICAgICAgICBsZXQgcGVuZGluZyA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKHF1ZXJ5KSBhcyBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxuXHJcbiAgICAgICAgLy8gTm8gbW9yZSBYTUwgZWxlbWVudHMgdG8gZXhwYW5kXHJcbiAgICAgICAgaWYgKHBlbmRpbmcubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIFhNTCBlbGVtZW50IGN1cnJlbnRseSBpbiB0aGUgY29udGFpbmVyOlxyXG4gICAgICAgIC8vICogQ3JlYXRlIGEgbmV3IHNwYW4gZWxlbWVudCBmb3IgaXRcclxuICAgICAgICAvLyAqIEhhdmUgdGhlIHByb2Nlc3NvcnMgdGFrZSBkYXRhIGZyb20gdGhlIFhNTCBlbGVtZW50LCB0byBwb3B1bGF0ZSB0aGUgbmV3IG9uZVxyXG4gICAgICAgIC8vICogUmVwbGFjZSB0aGUgWE1MIGVsZW1lbnQgd2l0aCB0aGUgbmV3IG9uZVxyXG4gICAgICAgIHBlbmRpbmcuZm9yRWFjaChlbGVtZW50ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudE5hbWUgPSBlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICAgICAgbGV0IGNvbnRleHQgICAgID0ge1xyXG4gICAgICAgICAgICAgICAgeG1sRWxlbWVudDogZWxlbWVudCxcclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQ6IG5ld0VsZW1lbnRcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIG5ld0VsZW1lbnQuZGF0YXNldFsndHlwZSddID0gZWxlbWVudE5hbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBJIHdhbnRlZCB0byB1c2UgYW4gaW5kZXggb24gRWxlbWVudFByb2Nlc3NvcnMgZm9yIHRoaXMsIGJ1dCBpdCBjYXVzZWQgZXZlcnlcclxuICAgICAgICAgICAgLy8gcHJvY2Vzc29yIHRvIGhhdmUgYW4gXCJ1bnVzZWQgbWV0aG9kXCIgd2FybmluZy5cclxuICAgICAgICAgICAgc3dpdGNoIChlbGVtZW50TmFtZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnY29hY2gnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5jb2FjaChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLmV4Y3VzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuaW50ZWdlcihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5uYW1lZChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BocmFzZXNldCc6ICAgRWxlbWVudFByb2Nlc3NvcnMucGhyYXNlc2V0KGNvbnRleHQpOyAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICBFbGVtZW50UHJvY2Vzc29ycy5wbGF0Zm9ybShjb250ZXh0KTsgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnNlcnZpY2UoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb24nOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhdGlvbmxpc3QnOiBFbGVtZW50UHJvY2Vzc29ycy5zdGF0aW9ubGlzdChjb250ZXh0KTsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnRpbWUoY29udGV4dCk7ICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudm94KGNvbnRleHQpOyAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogICAgICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy51bmtub3duKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGVsZW1lbnQucGFyZW50RWxlbWVudCEucmVwbGFjZUNoaWxkKG5ld0VsZW1lbnQsIGVsZW1lbnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBSZWN1cnNlIHNvIHRoYXQgd2UgY2FuIGV4cGFuZCBhbnkgbmV3IGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKGxldmVsIDwgMjApXHJcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250YWluZXIsIGxldmVsICsgMSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcihMLlBIUkFTRVJfVE9PX1JFQ1VSU0lWRSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IGNsYXNzIGZvciByZXNvbHZpbmcgYSBnaXZlbiBwaHJhc2UgdG8gdm94IGtleXMgKi9cclxuY2xhc3MgUmVzb2x2ZXJcclxue1xyXG4gICAgLyoqIFRyZWVXYWxrZXIgZmlsdGVyIHRvIHJlZHVjZSBhIHdhbGsgdG8ganVzdCB0aGUgZWxlbWVudHMgdGhlIHJlc29sdmVyIG5lZWRzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IG5vZGUucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXBhcmVudFR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgICAgID0gcGFyZW50LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICBwYXJlbnRUeXBlID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFjY2VwdCB0ZXh0IG9ubHkgZnJvbSBwaHJhc2UgYW5kIHBocmFzZXNldHNcclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpXHJcbiAgICAgICAgaWYgKHBhcmVudFR5cGUgIT09ICdwaHJhc2VzZXQnICYmIHBhcmVudFR5cGUgIT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcclxuXHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBsZXQgdHlwZSAgICA9IGVsZW1lbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICAgICAgLy8gUmVqZWN0IGNvbGxhcHNlZCBlbGVtZW50cyBhbmQgdGhlaXIgY2hpbGRyZW5cclxuICAgICAgICAgICAgaWYgKCBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVDtcclxuXHJcbiAgICAgICAgICAgIC8vIFNraXAgdHlwZWxlc3MgKHdyYXBwZXIpIGVsZW1lbnRzXHJcbiAgICAgICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCBvdmVyIHBocmFzZSBhbmQgcGhyYXNlc2V0cyAoaW5zdGVhZCwgb25seSBnb2luZyBmb3IgdGhlaXIgY2hpbGRyZW4pXHJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAncGhyYXNlc2V0JyB8fCB0eXBlID09PSAncGhyYXNlJylcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBocmFzZSAgICA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHByaXZhdGUgZmxhdHRlbmVkIDogTm9kZVtdO1xyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZWQgIDogVm94S2V5W107XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBocmFzZTogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5waHJhc2UgICAgPSBwaHJhc2U7XHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyB0b1ZveCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICAvLyBGaXJzdCwgd2FsayB0aHJvdWdoIHRoZSBwaHJhc2UgYW5kIFwiZmxhdHRlblwiIGl0IGludG8gYW4gYXJyYXkgb2YgcGFydHMuIFRoaXMgaXNcclxuICAgICAgICAvLyBzbyB0aGUgcmVzb2x2ZXIgY2FuIGxvb2stYWhlYWQgb3IgbG9vay1iZWhpbmQuXHJcblxyXG4gICAgICAgIHRoaXMuZmxhdHRlbmVkID0gW107XHJcbiAgICAgICAgdGhpcy5yZXNvbHZlZCAgPSBbXTtcclxuICAgICAgICBsZXQgdHJlZVdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXHJcbiAgICAgICAgICAgIHRoaXMucGhyYXNlLFxyXG4gICAgICAgICAgICBOb2RlRmlsdGVyLlNIT1dfVEVYVCB8IE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5ULFxyXG4gICAgICAgICAgICB7IGFjY2VwdE5vZGU6IFJlc29sdmVyLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIHRyZWVXYWxrZXIubmV4dE5vZGUoKSApXHJcbiAgICAgICAgaWYgKHRyZWVXYWxrZXIuY3VycmVudE5vZGUudGV4dENvbnRlbnQhLnRyaW0oKSAhPT0gJycpXHJcbiAgICAgICAgICAgIHRoaXMuZmxhdHRlbmVkLnB1c2godHJlZVdhbGtlci5jdXJyZW50Tm9kZSk7XHJcblxyXG4gICAgICAgIC8vIFRoZW4sIHJlc29sdmUgYWxsIHRoZSBwaHJhc2VzJyBub2RlcyBpbnRvIHZveCBrZXlzXHJcblxyXG4gICAgICAgIHRoaXMuZmxhdHRlbmVkLmZvckVhY2goICh2LCBpKSA9PiB0aGlzLnJlc29sdmVkLnB1c2goIC4uLnRoaXMucmVzb2x2ZSh2LCBpKSApICk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMuZmxhdHRlbmVkLCB0aGlzLnJlc29sdmVkKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVzZXMgdGhlIHR5cGUgYW5kIHZhbHVlIG9mIHRoZSBnaXZlbiBub2RlLCB0byByZXNvbHZlIGl0IHRvIHZveCBmaWxlIElEcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbm9kZSBOb2RlIHRvIHJlc29sdmUgdG8gdm94IElEc1xyXG4gICAgICogQHBhcmFtIGlkeCBJbmRleCBvZiB0aGUgbm9kZSBiZWluZyByZXNvbHZlZCByZWxhdGl2ZSB0byB0aGUgcGhyYXNlIGFycmF5XHJcbiAgICAgKiBAcmV0dXJucyBBcnJheSBvZiBJRHMgdGhhdCBtYWtlIHVwIG9uZSBvciBtb3JlIGZpbGUgSURzLiBDYW4gYmUgZW1wdHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVzb2x2ZShub2RlOiBOb2RlLCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRleHQobm9kZSk7XHJcblxyXG4gICAgICAgIGxldCBlbGVtZW50ID0gbm9kZSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgdHlwZSAgICA9IGVsZW1lbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlICdjb2FjaCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVDb2FjaChlbGVtZW50LCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIHJldHVybiB0aGlzLnJlc29sdmVFeGN1c2UoaWR4KTtcclxuICAgICAgICAgICAgY2FzZSAnaW50ZWdlcic6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlSW50ZWdlcihlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlTmFtZWQoKTtcclxuICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICByZXR1cm4gdGhpcy5yZXNvbHZlUGxhdGZvcm0oaWR4KTtcclxuICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlU2VydmljZShlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnc3RhdGlvbic6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlU3RhdGlvbihlbGVtZW50LCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9ubGlzdCc6IHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uTGlzdChlbGVtZW50LCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVUaW1lKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICd2b3gnOiAgICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVWb3goZWxlbWVudCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRJbmZsZWN0aW9uKGlkeDogbnVtYmVyKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXh0ID0gdGhpcy5mbGF0dGVuZWRbaWR4ICsgMV07XHJcblxyXG4gICAgICAgIHJldHVybiAoIG5leHQgJiYgbmV4dC50ZXh0Q29udGVudCEudHJpbSgpLnN0YXJ0c1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgID8gJ2VuZCdcclxuICAgICAgICAgICAgOiAnbWlkJztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVUZXh0KG5vZGU6IE5vZGUpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICBsZXQgdGV4dCAgID0gU3RyaW5ncy5jbGVhbihub2RlLnRleHRDb250ZW50ISk7XHJcbiAgICAgICAgbGV0IHNldCAgICA9IFtdO1xyXG5cclxuICAgICAgICAvLyBJZiB0ZXh0IGlzIGp1c3QgYSBmdWxsIHN0b3AsIHJldHVybiBzaWxlbmNlXHJcbiAgICAgICAgaWYgKHRleHQgPT09ICcuJylcclxuICAgICAgICAgICAgcmV0dXJuIFswLjY1XTtcclxuXHJcbiAgICAgICAgLy8gSWYgaXQgYmVnaW5zIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LnN0YXJ0c1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHNldC5wdXNoKDAuNjUpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGV4dCBkb2Vzbid0IGNvbnRhaW4gYW55IHdvcmRzLCBza2lwXHJcbiAgICAgICAgaWYgKCAhdGV4dC5tYXRjaCgvW2EtejAtOV0vaSkgKVxyXG4gICAgICAgICAgICByZXR1cm4gc2V0O1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHR5cGUgICA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgcmVmID0gcGFyZW50LmRhdGFzZXRbJ3JlZiddO1xyXG4gICAgICAgIGxldCBpZHggPSBET00ubm9kZUluZGV4T2Yobm9kZSk7XHJcbiAgICAgICAgbGV0IGlkICA9IGAke3R5cGV9LiR7cmVmfWA7XHJcblxyXG4gICAgICAgIC8vIEFwcGVuZCBpbmRleCBvZiBwaHJhc2VzZXQncyBjaG9pY2Ugb2YgcGhyYXNlXHJcbiAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnKVxyXG4gICAgICAgICAgICBpZCArPSBgLiR7cGFyZW50LmRhdGFzZXRbJ2lkeCddfWA7XHJcblxyXG4gICAgICAgIGlkICs9IGAuJHtpZHh9YDtcclxuICAgICAgICBzZXQucHVzaChpZCk7XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgZW5kcyB3aXRoIGEgZnVsbCBzdG9wLCBhZGQgc2lsZW5jZVxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJldHVybiBzZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlQ29hY2goZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IGNvYWNoICAgPSBSQUcuc3RhdGUuZ2V0Q29hY2goY3R4KTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMiwgYGxldHRlci4ke2NvYWNofS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVFeGN1c2UoaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgZXhjdXNlICA9IFJBRy5zdGF0ZS5leGN1c2U7XHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBTdHJpbmdzLmZpbGVuYW1lKGV4Y3VzZSk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFswLjE1LCBgZXhjdXNlLiR7a2V5fS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVJbnRlZ2VyKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGVsZW1lbnQuZGF0YXNldFsnc2luZ3VsYXInXTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBlbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIGxldCBpbnRlZ2VyICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGN0eCk7XHJcbiAgICAgICAgbGV0IHBhcnRzICAgID0gWzAuMTI1LCBgbnVtYmVyLiR7aW50ZWdlcn0ubWlkYF07XHJcblxyXG4gICAgICAgIGlmICAgICAgKHNpbmd1bGFyICYmIGludGVnZXIgPT09IDEpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSwgYG51bWJlci5zdWZmaXguJHtzaW5ndWxhcn0uZW5kYCk7XHJcbiAgICAgICAgZWxzZSBpZiAocGx1cmFsICAgJiYgaW50ZWdlciAhPT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjE1LCBgbnVtYmVyLnN1ZmZpeC4ke3BsdXJhbH0uZW5kYCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMTUpO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFydHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlTmFtZWQoKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWVkID0gU3RyaW5ncy5maWxlbmFtZShSQUcuc3RhdGUubmFtZWQpO1xyXG5cclxuICAgICAgICByZXR1cm4gWzAuMiwgYG5hbWVkLiR7bmFtZWR9Lm1pZGAsIDAuMl07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlUGxhdGZvcm0oaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgcGxhdGZvcm0gPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcbiAgICAgICAgbGV0IGluZmxlY3QgID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IGxldHRlciAgID0gKHBsYXRmb3JtWzFdID09PSAnwr4nKSA/ICdNJyA6IHBsYXRmb3JtWzFdO1xyXG4gICAgICAgIGxldCByZXN1bHQgICA9IFswLjE1LCBgbnVtYmVyLiR7cGxhdGZvcm1bMF19JHtsZXR0ZXJ9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVNlcnZpY2UoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc2VydmljZSA9IFN0cmluZ3MuZmlsZW5hbWUoIFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKGN0eCkgKTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFtdO1xyXG5cclxuICAgICAgICAvLyBPbmx5IGFkZCBiZWdpbm5pbmcgZGVsYXkgaWYgdGhlcmUgaXNuJ3QgYWxyZWFkeSBvbmUgcHJpb3JcclxuICAgICAgICBpZiAodHlwZW9mIHRoaXMucmVzb2x2ZWQuc2xpY2UoLTEpWzBdICE9PSAnbnVtYmVyJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4xNSk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucmVzdWx0LCBgc2VydmljZS4ke3NlcnZpY2V9Lm1pZGAsIDAuMTVdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbihjdHgpO1xyXG4gICAgICAgIGxldCB2b3hLZXkgID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb25Wb3goc3RhdGlvbik7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFswLjIsIGBzdGF0aW9uLiR7dm94S2V5fS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVTdGF0aW9uTGlzdChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgbGlzdCAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcblxyXG4gICAgICAgIGxldCBwYXJ0cyA6IFZveEtleVtdID0gWzAuMl07XHJcblxyXG4gICAgICAgIGxpc3QuZm9yRWFjaCggKGNvZGUsIGspID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdm94S2V5ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb25Wb3goY29kZSk7XHJcblxyXG4gICAgICAgICAgICAvLyBIYW5kbGUgbWlkZGxlIG9mIGxpc3QgaW5mbGVjdGlvblxyXG4gICAgICAgICAgICBpZiAoayAhPT0gbGlzdC5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGBzdGF0aW9uLiR7dm94S2V5fS5taWRgLCAwLjI1KTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwiYW5kXCIgaWYgbGlzdCBoYXMgbW9yZSB0aGFuIDEgc3RhdGlvbiBhbmQgdGhpcyBpcyB0aGUgZW5kXHJcbiAgICAgICAgICAgIGlmIChsaXN0Lmxlbmd0aCA+IDEpXHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCdzdGF0aW9uLnBhcnRzLmFuZC5taWQnLCAwLjI1KTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFkZCBcIm9ubHlcIiBpZiBvbmx5IG9uZSBzdGF0aW9uIGluIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICAgICAgaWYgKGxpc3QubGVuZ3RoID09PSAxICYmIGN0eCA9PT0gJ2NhbGxpbmcnKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGBzdGF0aW9uLiR7dm94S2V5fS5taWRgKTtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCAnc3RhdGlvbi5wYXJ0cy5vbmx5LmVuZCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9LiR7aW5mbGVjdH1gKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVUaW1lKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCB0aW1lICA9IFJBRy5zdGF0ZS5nZXRUaW1lKGN0eCkuc3BsaXQoJzonKTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMF0gPT09ICcwMCcgJiYgdGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgJ251bWJlci4wMDAwLm1pZCcsIDAuMl07XHJcblxyXG4gICAgICAgIC8vIEhvdXJzXHJcbiAgICAgICAgcGFydHMucHVzaChgbnVtYmVyLiR7dGltZVswXX0uYmVnaW5gKTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4wNzUsICdudW1iZXIuaHVuZHJlZC5taWQnKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCBgbnVtYmVyLiR7dGltZVsxXX0ubWlkYCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucGFydHMsIDAuMTVdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVZveChlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBlbGVtZW50LmlubmVyVGV4dC50cmltKCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IFtdO1xyXG5cclxuICAgICAgICBpZiAoIHRleHQuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJlc3VsdC5wdXNoKCBlbGVtZW50LmRhdGFzZXRbJ2tleSddISApO1xyXG5cclxuICAgICAgICBpZiAoIHRleHQuZW5kc1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuNjUpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBzcGVlY2ggc3ludGhlc2lzIHVzaW5nIGJvdGggbmF0aXZlIGFuZCBjdXN0b20gZW5naW5lcyAqL1xyXG5jbGFzcyBTcGVlY2hcclxue1xyXG4gICAgLyoqIEluc3RhbmNlIG9mIHRoZSBjdXN0b20gdm9pY2UgZW5naW5lICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHZveEVuZ2luZT8gOiBWb3hFbmdpbmU7XHJcblxyXG4gICAgLyoqIERpY3Rpb25hcnkgb2YgYnJvd3Nlci1wcm92aWRlZCB2b2ljZXMgYXZhaWxhYmxlICovXHJcbiAgICBwdWJsaWMgIGJyb3dzZXJWb2ljZXMgOiBEaWN0aW9uYXJ5PFNwZWVjaFN5bnRoZXNpc1ZvaWNlPiA9IHt9O1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGlzIGF1ZGlibHkgc3Bva2VuICovXHJcbiAgICBwdWJsaWMgIG9uc3BlYWs/ICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBlbmRlZCAqL1xyXG4gICAgcHVibGljICBvbnN0b3A/ICAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG5hdGl2ZSBzcGVlY2gtc3RvcHBlZCBjaGVjayB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSBzdG9wVGltZXIgICAgIDogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvKiogV2hldGhlciBhbnkgc3BlZWNoIGVuZ2luZSBpcyBjdXJyZW50bHkgc3BlYWtpbmcgKi9cclxuICAgIHB1YmxpYyBnZXQgaXNTcGVha2luZygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLnZveEVuZ2luZSAmJiB0aGlzLnZveEVuZ2luZS5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFraW5nO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBWT1ggZW5naW5lIGlzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBnZXQgdm94QXZhaWxhYmxlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudm94RW5naW5lICE9PSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBTb21lIGJyb3dzZXJzIGRvbid0IHByb3Blcmx5IGNhbmNlbCBzcGVlY2ggb24gcGFnZSBjbG9zZS5cclxuICAgICAgICAvLyBCVUc6IG9ucGFnZXNob3cgYW5kIG9ucGFnZWhpZGUgbm90IHdvcmtpbmcgb24gaU9TIDExXHJcbiAgICAgICAgd2luZG93Lm9uYmVmb3JldW5sb2FkID1cclxuICAgICAgICB3aW5kb3cub251bmxvYWQgICAgICAgPVxyXG4gICAgICAgIHdpbmRvdy5vbnBhZ2VzaG93ICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZWhpZGUgICAgID0gdGhpcy5zdG9wLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50Lm9udmlzaWJpbGl0eWNoYW5nZSAgICAgICAgICAgID0gdGhpcy5vblZpc2liaWxpdHlDaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLm9udm9pY2VzY2hhbmdlZCA9IHRoaXMub25Wb2ljZXNDaGFuZ2VkLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEV2ZW4gdGhvdWdoICdvbnZvaWNlc2NoYW5nZWQnIGlzIHVzZWQgbGF0ZXIgdG8gcG9wdWxhdGUgdGhlIGxpc3QsIENocm9tZSBkb2VzXHJcbiAgICAgICAgLy8gbm90IGFjdHVhbGx5IGZpcmUgdGhlIGV2ZW50IHVudGlsIHRoaXMgY2FsbC4uLlxyXG4gICAgICAgIHRoaXMub25Wb2ljZXNDaGFuZ2VkKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzb21lIHJlYXNvbiwgQ2hyb21lIG5lZWRzIHRoaXMgY2FsbGVkIG9uY2UgZm9yIG5hdGl2ZSBzcGVlY2ggdG8gd29ya1xyXG4gICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuY2FuY2VsKCk7XHJcblxyXG4gICAgICAgIHRyeSAgICAgICAgIHsgdGhpcy52b3hFbmdpbmUgPSBuZXcgVm94RW5naW5lKCk7IH1cclxuICAgICAgICBjYXRjaCAoZXJyKSB7IGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBjcmVhdGUgVk9YIGVuZ2luZTonLCBlcnIpOyB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBzcGVha2luZyB0aGUgZ2l2ZW4gcGhyYXNlIGNvbXBvbmVudHMgKi9cclxuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIC8vIFZPWCBlbmdpbmVcclxuICAgICAgICBpZiAgICAgICggdGhpcy52b3hFbmdpbmUgJiYgZWl0aGVyKHNldHRpbmdzLnVzZVZveCwgUkFHLmNvbmZpZy52b3hFbmFibGVkKSApXHJcbiAgICAgICAgICAgIHRoaXMuc3BlYWtWb3gocGhyYXNlLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIC8vIE5hdGl2ZSBicm93c2VyIHRleHQtdG8tc3BlZWNoXHJcbiAgICAgICAgZWxzZSBpZiAod2luZG93LnNwZWVjaFN5bnRoZXNpcylcclxuICAgICAgICAgICAgdGhpcy5zcGVha0Jyb3dzZXIocGhyYXNlLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIC8vIE5vIHNwZWVjaCBhdmFpbGFibGU7IGNhbGwgc3RvcCBldmVudCBoYW5kbGVyXHJcbiAgICAgICAgZWxzZSBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgIHRoaXMub25zdG9wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIGFuZCBjYW5jZWxzIGFsbCBxdWV1ZWQgc3BlZWNoICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzKVxyXG4gICAgICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmNhbmNlbCgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy52b3hFbmdpbmUpXHJcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lLnN0b3AoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQYXVzZSBhbmQgdW5wYXVzZSBzcGVlY2ggaWYgdGhlIHBhZ2UgaXMgaGlkZGVuIG9yIHVuaGlkZGVuICovXHJcbiAgICBwcml2YXRlIG9uVmlzaWJpbGl0eUNoYW5nZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IFRoaXMgbmVlZHMgdG8gcGF1c2UgVk9YIGVuZ2luZVxyXG4gICAgICAgIGxldCBoaWRpbmcgPSAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIGlmIChoaWRpbmcpIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucGF1c2UoKTtcclxuICAgICAgICBlbHNlICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnJlc3VtZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGFzeW5jIHZvaWNlIGxpc3QgbG9hZGluZyBvbiBzb21lIGJyb3dzZXJzLCBhbmQgc2V0cyBkZWZhdWx0ICovXHJcbiAgICBwcml2YXRlIG9uVm9pY2VzQ2hhbmdlZCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuYnJvd3NlclZvaWNlcyA9IHt9O1xyXG5cclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmdldFZvaWNlcygpLmZvckVhY2godiA9PiB0aGlzLmJyb3dzZXJWb2ljZXNbdi5uYW1lXSA9IHYpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIGdpdmVuIHBocmFzZSB0byB0ZXh0IGFuZCBzcGVha3MgaXQgdmlhIG5hdGl2ZSBicm93c2VyIHZvaWNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3BlYWtCcm93c2VyKHBocmFzZTogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZvaWNlTmFtZSA9IGVpdGhlcihzZXR0aW5ncy52b2ljZU5hbWUsIFJBRy5jb25maWcuc3BlZWNoVm9pY2UpO1xyXG4gICAgICAgIGxldCB2b2ljZSAgICAgPSB0aGlzLmJyb3dzZXJWb2ljZXNbdm9pY2VOYW1lXTtcclxuXHJcbiAgICAgICAgLy8gUmVzZXQgdG8gZmlyc3Qgdm9pY2UsIGlmIGNvbmZpZ3VyZWQgY2hvaWNlIGlzIG1pc3NpbmdcclxuICAgICAgICBpZiAoIXZvaWNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGZpcnN0ID0gT2JqZWN0LmtleXModGhpcy5icm93c2VyVm9pY2VzKVswXTtcclxuICAgICAgICAgICAgdm9pY2UgICAgID0gdGhpcy5icm93c2VyVm9pY2VzW2ZpcnN0XTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFRoZSBwaHJhc2UgdGV4dCBpcyBzcGxpdCBpbnRvIHNlbnRlbmNlcywgYXMgcXVldWVpbmcgbGFyZ2Ugc2VudGVuY2VzIHRoYXQgbGFzdFxyXG4gICAgICAgIC8vIG1hbnkgc2Vjb25kcyBjYW4gYnJlYWsgc29tZSBUVFMgZW5naW5lcyBhbmQgYnJvd3NlcnMuXHJcbiAgICAgICAgbGV0IHRleHQgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoL1xcLlxccy9pKTtcclxuXHJcbiAgICAgICAgcGFydHMuZm9yRWFjaCggKHNlZ21lbnQsIGlkeCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEFkZCBtaXNzaW5nIGZ1bGwgc3RvcCB0byBlYWNoIHNlbnRlbmNlIGV4Y2VwdCB0aGUgbGFzdCwgd2hpY2ggaGFzIGl0XHJcbiAgICAgICAgICAgIGlmIChpZHggPCBwYXJ0cy5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICAgICAgc2VnbWVudCArPSAnLic7XHJcblxyXG4gICAgICAgICAgICBsZXQgdXR0ZXJhbmNlID0gbmV3IFNwZWVjaFN5bnRoZXNpc1V0dGVyYW5jZShzZWdtZW50KTtcclxuXHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2ljZSAgPSB2b2ljZTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIFJBRy5jb25maWcuc3BlZWNoVm9sKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnBpdGNoICA9IGVpdGhlcihzZXR0aW5ncy5waXRjaCwgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2gpO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2UucmF0ZSAgID0gZWl0aGVyKHNldHRpbmdzLnJhdGUsICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlKTtcclxuXHJcbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuc3BlYWsodXR0ZXJhbmNlKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBpbW1lZGlhdGVseS4gSSBkb24ndCB0cnVzdCBzcGVlY2ggZXZlbnRzIHRvIGJlIHJlbGlhYmxlOyBzZWUgYmVsb3cuXHJcbiAgICAgICAgaWYgKHRoaXMub25zcGVhaylcclxuICAgICAgICAgICAgdGhpcy5vbnNwZWFrKCk7XHJcblxyXG4gICAgICAgIC8vIFRoaXMgY2hlY2tzIGZvciB3aGVuIHRoZSBuYXRpdmUgZW5naW5lIGhhcyBzdG9wcGVkIHNwZWFraW5nLCBhbmQgY2FsbHMgdGhlXHJcbiAgICAgICAgLy8gb25zdG9wIGV2ZW50IGhhbmRsZXIuIEkgY291bGQgdXNlIFNwZWVjaFN5bnRoZXNpcy5vbmVuZCBpbnN0ZWFkLCBidXQgaXQgd2FzXHJcbiAgICAgICAgLy8gZm91bmQgdG8gYmUgdW5yZWxpYWJsZSwgc28gSSBoYXZlIHRvIHBvbGwgdGhlIHNwZWFraW5nIHByb3BlcnR5IHRoaXMgd2F5LlxyXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5zdG9wVGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLnN0b3BUaW1lciA9IHNldEludGVydmFsKCgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAod2luZG93LnNwZWVjaFN5bnRoZXNpcy5zcGVha2luZylcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5zdG9wVGltZXIpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgICAgICB9LCAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3ludGhlc2l6ZXMgdm9pY2UgYnkgd2Fsa2luZyB0aHJvdWdoIHRoZSBnaXZlbiBwaHJhc2UgZWxlbWVudHMsIHJlc29sdmluZyBwYXJ0cyB0b1xyXG4gICAgICogc291bmQgZmlsZSBJRHMsIGFuZCBmZWVkaW5nIHRoZSBlbnRpcmUgYXJyYXkgdG8gdGhlIHZveCBlbmdpbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBocmFzZSBQaHJhc2UgZWxlbWVudHMgdG8gc3BlYWtcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwZWFrVm94KHBocmFzZTogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc29sdmVyID0gbmV3IFJlc29sdmVyKHBocmFzZSk7XHJcbiAgICAgICAgbGV0IHZveFBhdGggID0gUkFHLmNvbmZpZy52b3hQYXRoIHx8IFJBRy5jb25maWcudm94Q3VzdG9tUGF0aDtcclxuXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3BlYWsgPSAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMub25zcGVhaylcclxuICAgICAgICAgICAgICAgIHRoaXMub25zcGVhaygpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgPSAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3BlYWsgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgID0gdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBcHBseSBzZXR0aW5ncyBmcm9tIGNvbmZpZyBoZXJlLCB0byBrZWVwIFZPWCBlbmdpbmUgZGVjb3VwbGVkIGZyb20gUkFHXHJcbiAgICAgICAgc2V0dGluZ3Mudm94UGF0aCAgID0gZWl0aGVyKHNldHRpbmdzLnZveFBhdGgsICAgdm94UGF0aCk7XHJcbiAgICAgICAgc2V0dGluZ3Mudm94UmV2ZXJiID0gZWl0aGVyKHNldHRpbmdzLnZveFJldmVyYiwgUkFHLmNvbmZpZy52b3hSZXZlcmIpO1xyXG4gICAgICAgIHNldHRpbmdzLnZveENoaW1lICA9IGVpdGhlcihzZXR0aW5ncy52b3hDaGltZSwgIFJBRy5jb25maWcudm94Q2hpbWUpO1xyXG4gICAgICAgIHNldHRpbmdzLnZvbHVtZSAgICA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsICAgIFJBRy5jb25maWcuc3BlZWNoVm9sKTtcclxuICAgICAgICBzZXR0aW5ncy5yYXRlICAgICAgPSBlaXRoZXIoc2V0dGluZ3MucmF0ZSwgICAgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUpO1xyXG5cclxuICAgICAgICB0aGlzLnZveEVuZ2luZSEuc3BlYWsocmVzb2x2ZXIudG9Wb3goKSwgc2V0dGluZ3MpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVHlwZSBkZWZpbml0aW9uIGZvciBzcGVlY2ggY29uZmlnIG92ZXJyaWRlcyBwYXNzZWQgdG8gdGhlIHNwZWFrIG1ldGhvZCAqL1xyXG5pbnRlcmZhY2UgU3BlZWNoU2V0dGluZ3Ncclxue1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gZm9yY2UgdXNlIG9mIHRoZSBWT1ggZW5naW5lICovXHJcbiAgICB1c2VWb3g/ICAgIDogYm9vbGVhbjtcclxuICAgIC8qKiBPdmVycmlkZSBhYnNvbHV0ZSBvciByZWxhdGl2ZSBVUkwgb2YgVk9YIHZvaWNlIHRvIHVzZSAqL1xyXG4gICAgdm94UGF0aD8gICA6IHN0cmluZztcclxuICAgIC8qKiBPdmVycmlkZSBjaG9pY2Ugb2YgcmV2ZXJiIHRvIHVzZSAqL1xyXG4gICAgdm94UmV2ZXJiPyA6IHN0cmluZztcclxuICAgIC8qKiBPdmVycmlkZSBjaG9pY2Ugb2YgY2hpbWUgdG8gdXNlICovXHJcbiAgICB2b3hDaGltZT8gIDogc3RyaW5nO1xyXG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiBuYXRpdmUgdm9pY2UgKi9cclxuICAgIHZvaWNlTmFtZT8gOiBzdHJpbmc7XHJcbiAgICAvKiogT3ZlcnJpZGUgdm9sdW1lIG9mIHZvaWNlICovXHJcbiAgICB2b2x1bWU/ICAgIDogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHBpdGNoIG9mIHZvaWNlICovXHJcbiAgICBwaXRjaD8gICAgIDogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHJhdGUgb2Ygdm9pY2UgKi9cclxuICAgIHJhdGU/ICAgICAgOiBudW1iZXI7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbnR5cGUgVm94S2V5ID0gc3RyaW5nIHwgbnVtYmVyO1xyXG5cclxuLyoqIFN5bnRoZXNpemVzIHNwZWVjaCBieSBkeW5hbWljYWxseSBsb2FkaW5nIGFuZCBwaWVjaW5nIHRvZ2V0aGVyIHZvaWNlIGZpbGVzICovXHJcbmNsYXNzIFZveEVuZ2luZVxyXG57XHJcbiAgICAvKiogTGlzdCBvZiBpbXB1bHNlIHJlc3BvbnNlcyB0aGF0IGNvbWUgd2l0aCBSQUcgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgUkVWRVJCUyA6IERpY3Rpb25hcnk8c3RyaW5nPiA9IHtcclxuICAgICAgICAnJyAgICAgICAgICAgICAgICAgICAgIDogJ05vbmUnLFxyXG4gICAgICAgICdpci5zdGFsYmFucy53YXYnICAgICAgOiAnVGhlIExhZHkgQ2hhcGVsLCBTdCBBbGJhbnMgQ2F0aGVkcmFsJyxcclxuICAgICAgICAnaXIubWlkZGxlX3R1bm5lbC53YXYnIDogJ0lubm9jZW50IFJhaWx3YXkgVHVubmVsLCBFZGluYnVyZ2gnLFxyXG4gICAgICAgICdpci5ncmFuZ2UtY2VudHJlLndhdicgOiAnR3JhbmdlIHN0b25lIGNpcmNsZSwgQ291bnR5IExpbWVyaWNrJ1xyXG4gICAgfTtcclxuXHJcbiAgICAvKiogVGhlIGNvcmUgYXVkaW8gY29udGV4dCB0aGF0IGhhbmRsZXMgYXVkaW8gZWZmZWN0cyBhbmQgcGxheWJhY2sgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYXVkaW9Db250ZXh0IDogQXVkaW9Db250ZXh0O1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhbXBsaWZpZXMgb3IgYXR0ZW51YXRlcyB2b2ljZSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBnYWluTm9kZSAgICAgOiBHYWluTm9kZTtcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgYXBwbGllcyB0aGUgdGFubm95IGZpbHRlciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBmaWx0ZXJOb2RlICAgOiBCaXF1YWRGaWx0ZXJOb2RlO1xyXG4gICAgLyoqXHJcbiAgICAgKiBDYWNoZSBvZiBpbXB1bHNlIHJlc3BvbnNlcyByZXZlcmIgbm9kZXMsIGZvciByZXZlcmIuIFRoaXMgdXNlZCB0byBiZSBhIGRpY3Rpb25hcnlcclxuICAgICAqIG9mIEF1ZGlvQnVmZmVycywgYnV0IENvbnZvbHZlck5vZGVzIGNhbm5vdCBoYXZlIHRoZWlyIGJ1ZmZlcnMgY2hhbmdlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbXB1bHNlcyA6IERpY3Rpb25hcnk8Q29udm9sdmVyTm9kZT4gPSB7fTtcclxuICAgIC8qKiBSZWxhdGl2ZSBwYXRoIHRvIGZldGNoIGltcHVsc2UgcmVzcG9uc2UgYW5kIGNoaW1lIGZpbGVzIGZyb20gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZGF0YVBhdGggOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBhdWRpYmx5IGJlZ3VuICovXHJcbiAgICBwdWJsaWMgIG9uc3BlYWs/ICAgICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBlbmRlZCAqL1xyXG4gICAgcHVibGljICBvbnN0b3A/ICAgICAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgZW5naW5lIGlzIGN1cnJlbnRseSBydW5uaW5nIGFuZCBzcGVha2luZyAqL1xyXG4gICAgcHVibGljICBpc1NwZWFraW5nICAgICAgIDogYm9vbGVhbiAgICAgID0gZmFsc2U7XHJcbiAgICAvKiogV2hldGhlciB0aGlzIGVuZ2luZSBoYXMgYmVndW4gc3BlYWtpbmcgZm9yIGEgY3VycmVudCBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgYmVndW5TcGVha2luZyAgICA6IGJvb2xlYW4gICAgICA9IGZhbHNlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSBudW1iZXIgZm9yIHRoZSBjdXJyZW50IHB1bXAgdGltZXIgKi9cclxuICAgIHByaXZhdGUgcHVtcFRpbWVyICAgICAgICA6IG51bWJlciAgICAgICA9IDA7XHJcbiAgICAvKiogVHJhY2tzIHRoZSBhdWRpbyBjb250ZXh0J3Mgd2FsbC1jbG9jayB0aW1lIHRvIHNjaGVkdWxlIG5leHQgY2xpcCAqL1xyXG4gICAgcHJpdmF0ZSBuZXh0QmVnaW4gICAgICAgIDogbnVtYmVyICAgICAgID0gMDtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGN1cnJlbnRseSBwZW5kaW5nIHJlcXVlc3RzLCBhcyBhIEZJRk8gcXVldWUgKi9cclxuICAgIHByaXZhdGUgcGVuZGluZ1JlcXMgICAgICA6IFZveFJlcXVlc3RbXSA9IFtdO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHNjaGVkdWxlZCBhdWRpbyBidWZmZXJzICovXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlZEJ1ZmZlcnMgOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGVbXSA9IFtdO1xyXG4gICAgLyoqIExpc3Qgb2Ygdm94IElEcyBjdXJyZW50bHkgYmVpbmcgcnVuIHRocm91Z2ggKi9cclxuICAgIHByaXZhdGUgY3VycmVudElkcz8gICAgICA6IFZveEtleVtdO1xyXG4gICAgLyoqIFNwZWVjaCBzZXR0aW5ncyBjdXJyZW50bHkgYmVpbmcgdXNlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50U2V0dGluZ3M/IDogU3BlZWNoU2V0dGluZ3M7XHJcbiAgICAvKiogUmV2ZXJiIG5vZGUgY3VycmVudGx5IGJlaW5nIHVzZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFJldmVyYj8gICA6IENvbnZvbHZlck5vZGU7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGRhdGFQYXRoOiBzdHJpbmcgPSAnZGF0YS92b3gnKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNldHVwIHRoZSBjb3JlIGF1ZGlvIGNvbnRleHRcclxuXHJcbiAgICAgICAgLy8gQHRzLWlnbm9yZSAtIERlZmluaW5nIHRoZXNlIGluIFdpbmRvdyBpbnRlcmZhY2UgZG9lcyBub3Qgd29ya1xyXG4gICAgICAgIGxldCBhdWRpb0NvbnRleHQgID0gd2luZG93LkF1ZGlvQ29udGV4dCB8fCB3aW5kb3cud2Via2l0QXVkaW9Db250ZXh0O1xyXG4gICAgICAgIHRoaXMuYXVkaW9Db250ZXh0ID0gbmV3IGF1ZGlvQ29udGV4dCgpO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuYXVkaW9Db250ZXh0KVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBnZXQgYXVkaW8gY29udGV4dCcpO1xyXG5cclxuICAgICAgICAvLyBTZXR1cCBub2Rlc1xyXG5cclxuICAgICAgICB0aGlzLmRhdGFQYXRoICAgPSBkYXRhUGF0aDtcclxuICAgICAgICB0aGlzLmdhaW5Ob2RlICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS50eXBlICAgICAgPSAnaGlnaHBhc3MnO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS5RLnZhbHVlICAgPSAwLjQ7XHJcblxyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUuY29ubmVjdCh0aGlzLmZpbHRlck5vZGUpO1xyXG4gICAgICAgIC8vIFJlc3Qgb2Ygbm9kZXMgZ2V0IGNvbm5lY3RlZCB3aGVuIHNwZWFrIGlzIGNhbGxlZFxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQmVnaW5zIGxvYWRpbmcgYW5kIHNwZWFraW5nIGEgc2V0IG9mIHZveCBmaWxlcy4gU3RvcHMgYW55IHNwZWVjaC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWRzIExpc3Qgb2Ygdm94IGlkcyB0byBsb2FkIGFzIGZpbGVzLCBpbiBzcGVha2luZyBvcmRlclxyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFZvaWNlIHNldHRpbmdzIHRvIHVzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3BlYWsoaWRzOiBWb3hLZXlbXSwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggU1BFQUs6JywgaWRzLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIC8vIFNldCBzdGF0ZVxyXG5cclxuICAgICAgICBpZiAodGhpcy5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICB0aGlzLnN0b3AoKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nICAgICAgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuYmVndW5TcGVha2luZyAgID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgPSBpZHM7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSBzZXR0aW5ncztcclxuXHJcbiAgICAgICAgLy8gU2V0IHJldmVyYlxyXG5cclxuICAgICAgICBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eShzZXR0aW5ncy52b3hSZXZlcmIpIClcclxuICAgICAgICAgICAgdGhpcy5zZXRSZXZlcmIoKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZmlsZSAgID0gc2V0dGluZ3Mudm94UmV2ZXJiITtcclxuICAgICAgICAgICAgbGV0IHJldmVyYiA9IHRoaXMuaW1wdWxzZXNbZmlsZV07XHJcblxyXG4gICAgICAgICAgICBpZiAoIXJldmVyYilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHJldmVyYiBpcyBvZmYgZmlyc3QsIGVsc2UgY2xpcHMgd2lsbCBxdWV1ZSBpbiB0aGUgYXVkaW9cclxuICAgICAgICAgICAgICAgIC8vIGJ1ZmZlciBhbmQgYWxsIHN1ZGRlbmx5IHBsYXkgYXQgdGhlIHNhbWUgdGltZSwgd2hlbiByZXZlcmIgbG9hZHMuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFJldmVyYigpO1xyXG5cclxuICAgICAgICAgICAgICAgIGZldGNoKGAke3RoaXMuZGF0YVBhdGh9LyR7ZmlsZX1gKVxyXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKCByZXMgPT4gcmVzLmFycmF5QnVmZmVyKCkgKVxyXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKCBidWYgPT4gU291bmRzLmRlY29kZSh0aGlzLmF1ZGlvQ29udGV4dCwgYnVmKSApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIGltcCA9PiB0aGlzLmNyZWF0ZVJldmVyYihmaWxlLCBpbXApICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRSZXZlcmIocmV2ZXJiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNldCB2b2x1bWVcclxuXHJcbiAgICAgICAgbGV0IHZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIDEpO1xyXG5cclxuICAgICAgICAvLyBSZW1hcHMgdGhlIDEuMS4uLjEuOSByYW5nZSB0byAyLi4uMTBcclxuICAgICAgICBpZiAodm9sdW1lID4gMSlcclxuICAgICAgICAgICAgdm9sdW1lID0gKHZvbHVtZSAqIDEwKSAtIDk7XHJcblxyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGNoaW1lLCBhdCBmb3JjZWQgcGxheWJhY2sgcmF0ZSBvZiAxXHJcblxyXG4gICAgICAgIGlmICggIVN0cmluZ3MuaXNOdWxsT3JFbXB0eShzZXR0aW5ncy52b3hDaGltZSkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBhdGggICAgICA9IGAke3RoaXMuZGF0YVBhdGh9LyR7c2V0dGluZ3Mudm94Q2hpbWUhfWA7XHJcbiAgICAgICAgICAgIGxldCByZXEgICAgICAgPSBuZXcgVm94UmVxdWVzdChwYXRoLCAwLCB0aGlzLmF1ZGlvQ29udGV4dCk7XHJcbiAgICAgICAgICAgIHJlcS5mb3JjZVJhdGUgPSAxO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5wdXNoKHJlcSk7XHJcbiAgICAgICAgICAgIGlkcy51bnNoaWZ0KDEuMCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCZWdpbiB0aGUgcHVtcCBsb29wLiBPbiBpT1MsIHRoZSBjb250ZXh0IG1heSBoYXZlIHRvIGJlIHJlc3VtZWQgZmlyc3RcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSAnc3VzcGVuZGVkJylcclxuICAgICAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCkudGhlbiggKCkgPT4gdGhpcy5wdW1wKCkgKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMucHVtcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyBwbGF5aW5nIGFueSBjdXJyZW50bHkgc3Bva2VuIHNwZWVjaCBhbmQgcmVzZXRzIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIEFscmVhZHkgc3RvcHBlZD8gRG8gbm90IGNvbnRpbnVlXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gU3RvcCBwdW1waW5nXHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucHVtcFRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbGwgcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMuZm9yRWFjaCggciA9PiByLmNhbmNlbCgpICk7XHJcblxyXG4gICAgICAgIC8vIEtpbGwgYW5kIGRlcmVmZXJlbmNlIGFueSBjdXJyZW50bHkgcGxheWluZyBmaWxlXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmZvckVhY2gobm9kZSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbm9kZS5zdG9wKCk7XHJcbiAgICAgICAgICAgIG5vZGUuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm5leHRCZWdpbiAgICAgICAgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyAgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcyAgICAgID0gW107XHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzID0gW107XHJcblxyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTVE9QUEVEJyk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFB1bXBzIHRoZSBzcGVlY2ggcXVldWUsIGJ5IGtlZXBpbmcgdXAgdG8gMTAgZmV0Y2ggcmVxdWVzdHMgZm9yIHZvaWNlIGZpbGVzIGdvaW5nLFxyXG4gICAgICogYW5kIHRoZW4gZmVlZGluZyB0aGVpciBkYXRhIChpbiBlbmZvcmNlZCBvcmRlcikgdG8gdGhlIGF1ZGlvIGNoYWluLCBvbmUgYXQgYSB0aW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHB1bXAoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBJZiB0aGUgZW5naW5lIGhhcyBzdG9wcGVkLCBkbyBub3QgcHJvY2VlZC5cclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZyB8fCAhdGhpcy5jdXJyZW50SWRzIHx8ICF0aGlzLmN1cnJlbnRTZXR0aW5ncylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGaXJzdCwgc2NoZWR1bGUgZnVsZmlsbGVkIHJlcXVlc3RzIGludG8gdGhlIGF1ZGlvIGJ1ZmZlciwgaW4gRklGTyBvcmRlclxyXG4gICAgICAgIHRoaXMuc2NoZWR1bGUoKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZmlsbCBhbnkgZnJlZSBwZW5kaW5nIHNsb3RzIHdpdGggbmV3IHJlcXVlc3RzXHJcbiAgICAgICAgbGV0IG5leHREZWxheSA9IDA7XHJcblxyXG4gICAgICAgIHdoaWxlICh0aGlzLmN1cnJlbnRJZHNbMF0gJiYgdGhpcy5wZW5kaW5nUmVxcy5sZW5ndGggPCAxMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSB0aGlzLmN1cnJlbnRJZHMuc2hpZnQoKSE7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB0aGlzIGtleSBpcyBhIG51bWJlciwgaXQncyBhbiBhbW91bnQgb2Ygc2lsZW5jZSwgc28gYWRkIGl0IGFzIHRoZVxyXG4gICAgICAgICAgICAvLyBwbGF5YmFjayBkZWxheSBmb3IgdGhlIG5leHQgcGxheWFibGUgcmVxdWVzdCAoaWYgYW55KS5cclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBrZXkgPT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuZXh0RGVsYXkgKz0ga2V5O1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGxldCBwYXRoID0gYCR7dGhpcy5jdXJyZW50U2V0dGluZ3Mudm94UGF0aH0vJHtrZXl9Lm1wM2A7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2goIG5ldyBWb3hSZXF1ZXN0KHBhdGgsIG5leHREZWxheSwgdGhpcy5hdWRpb0NvbnRleHQpICk7XHJcbiAgICAgICAgICAgIG5leHREZWxheSA9IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmcgd2hlbiB3ZSdyZSBvdXQgb2YgSURzIHRvIHF1ZXVlIGFuZCBub3RoaW5nIGlzIHBsYXlpbmdcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50SWRzLmxlbmd0aCAgICAgICA8PSAwKVxyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPD0gMClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLnB1bXBUaW1lciA9IHNldFRpbWVvdXQodGhpcy5wdW1wLmJpbmQodGhpcyksIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzY2hlZHVsZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFN0b3Agc2NoZWR1bGluZyBpZiB0aGVyZSBhcmUgbm8gcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIGlmICghdGhpcy5wZW5kaW5nUmVxc1swXSB8fCAhdGhpcy5wZW5kaW5nUmVxc1swXS5pc0RvbmUpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gRG9uJ3Qgc2NoZWR1bGUgaWYgbW9yZSB0aGFuIDUgbm9kZXMgYXJlLCBhcyBub3QgdG8gYmxvdyBhbnkgYnVmZmVyc1xyXG4gICAgICAgIGlmICh0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMubGVuZ3RoID4gNSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgcmVxID0gdGhpcy5wZW5kaW5nUmVxcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIG5leHQgcmVxdWVzdCBlcnJvcmVkIG91dCAoYnVmZmVyIG1pc3NpbmcpLCBza2lwIGl0XHJcbiAgICAgICAgaWYgKCFyZXEuYnVmZmVyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIFNLSVBQRUQ6JywgcmVxLnBhdGgpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY2hlZHVsZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhpcyBpcyB0aGUgZmlyc3QgY2xpcCBiZWluZyBwbGF5ZWQsIHN0YXJ0IGZyb20gY3VycmVudCB3YWxsLWNsb2NrXHJcbiAgICAgICAgaWYgKHRoaXMubmV4dEJlZ2luID09PSAwKVxyXG4gICAgICAgICAgICB0aGlzLm5leHRCZWdpbiA9IHRoaXMuYXVkaW9Db250ZXh0LmN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgUVVFVUVEOicsIHJlcS5wYXRoLCByZXEuYnVmZmVyLmR1cmF0aW9uLCB0aGlzLm5leHRCZWdpbik7XHJcblxyXG4gICAgICAgIC8vIEJhc2UgbGF0ZW5jeSBub3QgYXZhaWxhYmxlIGluIHNvbWUgYnJvd3NlcnNcclxuICAgICAgICBsZXQgbGF0ZW5jeSA9ICh0aGlzLmF1ZGlvQ29udGV4dC5iYXNlTGF0ZW5jeSB8fCAwLjAxKSArIDAuMTU7XHJcbiAgICAgICAgbGV0IG5vZGUgICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICBsZXQgcmF0ZSAgICA9IHJlcS5mb3JjZVJhdGUgfHwgdGhpcy5jdXJyZW50U2V0dGluZ3MhLnJhdGUgfHwgMTtcclxuICAgICAgICBub2RlLmJ1ZmZlciA9IHJlcS5idWZmZXI7XHJcblxyXG4gICAgICAgIC8vIFJlbWFwIHJhdGUgZnJvbSAwLjEuLjEuOSB0byAwLjguLjEuNVxyXG4gICAgICAgIGlmICAgICAgKHJhdGUgPCAxKSByYXRlID0gKHJhdGUgKiAwLjIpICsgMC44O1xyXG4gICAgICAgIGVsc2UgaWYgKHJhdGUgPiAxKSByYXRlID0gKHJhdGUgKiAwLjUpICsgMC41O1xyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgZGVsYXkgYW5kIGR1cmF0aW9uIGJhc2VkIG9uIHBsYXliYWNrIHJhdGVcclxuICAgICAgICBsZXQgZGVsYXkgICAgPSByZXEuZGVsYXkgKiAoMSAvIHJhdGUpO1xyXG4gICAgICAgIGxldCBkdXJhdGlvbiA9IG5vZGUuYnVmZmVyLmR1cmF0aW9uICogKDEgLyByYXRlKTtcclxuXHJcbiAgICAgICAgbm9kZS5wbGF5YmFja1JhdGUudmFsdWUgPSByYXRlO1xyXG4gICAgICAgIG5vZGUuY29ubmVjdCh0aGlzLmdhaW5Ob2RlKTtcclxuICAgICAgICBub2RlLnN0YXJ0KHRoaXMubmV4dEJlZ2luICsgZGVsYXkpO1xyXG5cclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMucHVzaChub2RlKTtcclxuICAgICAgICB0aGlzLm5leHRCZWdpbiArPSAoZHVyYXRpb24gKyBkZWxheSAtIGxhdGVuY3kpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIG9uLWZpcnN0LXNwZWFrIGV2ZW50XHJcbiAgICAgICAgaWYgKCF0aGlzLmJlZ3VuU3BlYWtpbmcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJlZ3VuU3BlYWtpbmcgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub25zcGVhaylcclxuICAgICAgICAgICAgICAgIHRoaXMub25zcGVhaygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGF2ZSB0aGlzIGJ1ZmZlciBub2RlIHJlbW92ZSBpdHNlbGYgZnJvbSB0aGUgc2NoZWR1bGUgd2hlbiBkb25lXHJcbiAgICAgICAgbm9kZS5vbmVuZGVkID0gXyA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIEVOREVEOicsIHJlcS5wYXRoKTtcclxuICAgICAgICAgICAgbGV0IGlkeCA9IHRoaXMuc2NoZWR1bGVkQnVmZmVycy5pbmRleE9mKG5vZGUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGlkeCAhPT0gLTEpXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuc3BsaWNlKGlkeCwgMSk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZVJldmVyYihmaWxlOiBzdHJpbmcsIGltcHVsc2U6IEF1ZGlvQnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmltcHVsc2VzW2ZpbGVdICAgICAgICAgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUNvbnZvbHZlcigpO1xyXG4gICAgICAgIHRoaXMuaW1wdWxzZXNbZmlsZV0uYnVmZmVyICAgID0gaW1wdWxzZTtcclxuICAgICAgICB0aGlzLmltcHVsc2VzW2ZpbGVdLm5vcm1hbGl6ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5zZXRSZXZlcmIodGhpcy5pbXB1bHNlc1tmaWxlXSk7XHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFVkVSQiBMT0FERUQ6JywgZmlsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRSZXZlcmIocmV2ZXJiPzogQ29udm9sdmVyTm9kZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFJldmVyYilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFJldmVyYi5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFJldmVyYiA9IHVuZGVmaW5lZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS5kaXNjb25uZWN0KCk7XHJcblxyXG4gICAgICAgIGlmIChyZXZlcmIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRSZXZlcmIgPSByZXZlcmI7XHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyTm9kZS5jb25uZWN0KHJldmVyYik7XHJcbiAgICAgICAgICAgIHJldmVyYi5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmZpbHRlck5vZGUuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgcmVxdWVzdCBmb3IgYSB2b3ggZmlsZSwgaW1tZWRpYXRlbHkgYmVndW4gb24gY3JlYXRpb24gKi9cclxuY2xhc3MgVm94UmVxdWVzdFxyXG57XHJcbiAgICAvKiogUmVsYXRpdmUgcmVtb3RlIHBhdGggb2YgdGhpcyB2b2ljZSBmaWxlIHJlcXVlc3QgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgcGF0aCAgICA6IHN0cmluZztcclxuICAgIC8qKiBBbW91bnQgb2Ygc2Vjb25kcyB0byBkZWxheSB0aGUgcGxheWJhY2sgb2YgdGhpcyByZXF1ZXN0ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGRlbGF5ICAgOiBudW1iZXI7XHJcbiAgICAvKiogQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQgOiBBdWRpb0NvbnRleHQ7XHJcbiAgICAvKiogQWJvcnQgY29udHJvbGxlciB0byBhbGxvdyB0aGUgZmV0Y2ggdG8gYmUgYWJvcnRlZCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBhYm9ydCAgIDogQWJvcnRDb250cm9sbGVyO1xyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBkb25lIGFuZCByZWFkeSBmb3IgaGFuZGxpbmcgKGV2ZW4gaWYgZmFpbGVkKSAqL1xyXG4gICAgcHVibGljIGlzRG9uZSAgICAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogUmF3IGF1ZGlvIGRhdGEgZnJvbSB0aGUgbG9hZGVkIGZpbGUsIGlmIGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljIGJ1ZmZlcj8gICAgOiBBdWRpb0J1ZmZlcjtcclxuICAgIC8qKiBQbGF5YmFjayByYXRlIHRvIGZvcmNlIHRoaXMgY2xpcCB0byBwbGF5IGF0ICovXHJcbiAgICBwdWJsaWMgZm9yY2VSYXRlPyA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGF0aDogc3RyaW5nLCBkZWxheTogbnVtYmVyLCBjb250ZXh0OiBBdWRpb0NvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFUVVFU1Q6JywgcGF0aCk7XHJcbiAgICAgICAgdGhpcy5jb250ZXh0ID0gY29udGV4dDtcclxuICAgICAgICB0aGlzLnBhdGggICAgPSBwYXRoO1xyXG4gICAgICAgIHRoaXMuZGVsYXkgICA9IGRlbGF5O1xyXG4gICAgICAgIHRoaXMuYWJvcnQgICA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcclxuXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vd2ViL3VwZGF0ZXMvMjAxNy8wOS9hYm9ydGFibGUtZmV0Y2hcclxuICAgICAgICBmZXRjaChwYXRoLCB7IHNpZ25hbCA6IHRoaXMuYWJvcnQuc2lnbmFsIH0pXHJcbiAgICAgICAgICAgIC50aGVuICggdGhpcy5vbkZ1bGZpbGwuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICApO1xyXG5cclxuICAgICAgICAvLyBUaW1lb3V0IGFsbCBmZXRjaGVzIGJ5IDEwIHNlY29uZHNcclxuICAgICAgICBzZXRUaW1lb3V0KF8gPT4gdGhpcy5hYm9ydC5hYm9ydCgpLCAxMCAqIDEwMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYW5jZWxzIHRoaXMgcmVxdWVzdCBmcm9tIHByb2NlZWRpbmcgYW55IGZ1cnRoZXIgKi9cclxuICAgIHB1YmxpYyBjYW5jZWwoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmFib3J0LmFib3J0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBkZWNvZGluZyB0aGUgbG9hZGVkIE1QMyB2b2ljZSBmaWxlIHRvIHJhdyBhdWRpbyBkYXRhICovXHJcbiAgICBwcml2YXRlIG9uRnVsZmlsbChyZXM6IFJlc3BvbnNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXJlcy5vaylcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoYFZPWCBOT1QgRk9VTkQ6ICR7cmVzLnN0YXR1c30gQCAke3RoaXMucGF0aH1gKTtcclxuXHJcbiAgICAgICAgcmVzLmFycmF5QnVmZmVyKCkudGhlbiggdGhpcy5vbkFycmF5QnVmZmVyLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVGFrZXMgdGhlIGFycmF5IGJ1ZmZlciBmcm9tIHRoZSBmdWxmaWxsZWQgZmV0Y2ggYW5kIGRlY29kZXMgaXQgKi9cclxuICAgIHByaXZhdGUgb25BcnJheUJ1ZmZlcihidWZmZXI6IEFycmF5QnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTb3VuZHMuZGVjb2RlKHRoaXMuY29udGV4dCwgYnVmZmVyKVxyXG4gICAgICAgICAgICAudGhlbiAoIHRoaXMub25EZWNvZGUuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIHRoZSBmZXRjaGVkIGJ1ZmZlciBpcyBkZWNvZGVkIHN1Y2Nlc3NmdWxseSAqL1xyXG4gICAgcHJpdmF0ZSBvbkRlY29kZShidWZmZXI6IEF1ZGlvQnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlcjtcclxuICAgICAgICB0aGlzLmlzRG9uZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGxlZCBpZiB0aGUgZmV0Y2ggb3IgZGVjb2RlIHN0YWdlcyBmYWlsICovXHJcbiAgICBwcml2YXRlIG9uRXJyb3IoZXJyOiBhbnkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdSRVFVRVNUIEZBSUw6JywgZXJyKTtcclxuICAgICAgICB0aGlzLmlzRG9uZSA9IHRydWU7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vIFRPRE86IE1ha2UgYWxsIHZpZXdzIHVzZSB0aGlzIGNsYXNzXHJcbi8qKiBCYXNlIGNsYXNzIGZvciBhIHZpZXc7IGFueXRoaW5nIHdpdGggYSBiYXNlIERPTSBlbGVtZW50ICovXHJcbmFic3RyYWN0IGNsYXNzIFZpZXdCYXNlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyB2aWV3J3MgcHJpbWFyeSBET00gZWxlbWVudCAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIHRoaXMgYmFzZSB2aWV3LCBhdHRhY2hpbmcgaXQgdG8gdGhlIGVsZW1lbnQgbWF0Y2hpbmcgdGhlIGdpdmVuIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoZG9tUXVlcnk6IHN0cmluZyB8IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0eXBlb2YgZG9tUXVlcnkgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKGRvbVF1ZXJ5KTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZG9tID0gZG9tUXVlcnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhpcyB2aWV3J3MgY2hpbGQgZWxlbWVudCBtYXRjaGluZyB0aGUgZ2l2ZW4gcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBhdHRhY2g8VCBleHRlbmRzIEhUTUxFbGVtZW50PihxdWVyeTogc3RyaW5nKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gRE9NLnJlcXVpcmUocXVlcnksIHRoaXMuZG9tKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwidmlld0Jhc2UudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGRpc2NsYWltZXIgc2NyZWVuICovXHJcbmNsYXNzIERpc2NsYWltZXIgZXh0ZW5kcyBWaWV3QmFzZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBcImNvbnRpbnVlXCIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkRpc21pc3MgOiBIVE1MQnV0dG9uRWxlbWVudCA9IHRoaXMuYXR0YWNoKCcjYnRuRGlzbWlzcycpO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGxhc3QgZm9jdXNlZCBlbGVtZW50LCBpZiBhbnkgKi9cclxuICAgIHByaXZhdGUgbGFzdEFjdGl2ZT8gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCcjZGlzY2xhaW1lclNjcmVlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBPcGVucyB0aGUgZGlzY2xhaW1lciBmb3IgZmlyc3QgdGltZSB1c2VycyAqL1xyXG4gICAgcHVibGljIGRpc2NsYWltKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKFJBRy5jb25maWcucmVhZERpc2NsYWltZXIpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5sYXN0QWN0aXZlICAgICAgICAgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIFJBRy52aWV3cy5tYWluLmhpZGRlbiAgID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gICAgICAgICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuRGlzbWlzcy5vbmNsaWNrID0gdGhpcy5vbkRpc21pc3MuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bkRpc21pc3MuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGVyc2lzdHMgdGhlIGRpc21pc3NhbCB0byBzdG9yYWdlIGFuZCByZXN0b3JlcyB0aGUgbWFpbiBzY3JlZW4gKi9cclxuICAgIHByaXZhdGUgb25EaXNtaXNzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5yZWFkRGlzY2xhaW1lciA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuICAgICAgICAgICA9IHRydWU7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuICAgICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuRGlzbWlzcy5vbmNsaWNrICAgPSBudWxsO1xyXG4gICAgICAgIFJBRy5jb25maWcuc2F2ZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5sYXN0QWN0aXZlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5sYXN0QWN0aXZlLmZvY3VzKCk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEFjdGl2ZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlIGVkaXRvciAqL1xyXG5jbGFzcyBFZGl0b3Jcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIGNvbnRhaW5lciBmb3IgdGhlIGVkaXRvciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgZGlhbG9nLCBpZiBhbnkgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFBpY2tlcj8gOiBQaWNrZXI7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBjdXJyZW50bHkgYmVpbmcgZWRpdGVkLCBpZiBhbnkgKi9cclxuICAgIC8vIERvIG5vdCBEUlk7IG5lZWRzIHRvIGJlIHBhc3NlZCB0byB0aGUgcGlja2VyIGZvciBjbGVhbmVyIGNvZGVcclxuICAgIHByaXZhdGUgZG9tRWRpdGluZz8gICAgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tID0gRE9NLnJlcXVpcmUoJyNlZGl0b3InKTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmNsaWNrID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93Lm9ucmVzaXplICAgICAgID0gdGhpcy5vblJlc2l6ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tLm9uc2Nyb2xsICAgICA9IHRoaXMub25TY3JvbGwuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS50ZXh0Q29udGVudCAgPSBMLkVESVRPUl9JTklUO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyB0aGUgZWRpdG9yIHdpdGggYSByb290IHBocmFzZXNldCByZWZlcmVuY2UsIGFuZCBleHBhbmRzIGl0IGludG8gSFRNTCAqL1xyXG4gICAgcHVibGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJzxwaHJhc2VzZXQgcmVmPVwicm9vdFwiIC8+JztcclxuXHJcbiAgICAgICAgUkFHLnBocmFzZXIucHJvY2Vzcyh0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5hdHRhY2hDb250cm9scygpO1xyXG5cclxuICAgICAgICAvLyBGb3Igc2Nyb2xsLXBhc3QgcGFkZGluZyB1bmRlciB0aGUgcGhyYXNlXHJcbiAgICAgICAgbGV0IHBhZGRpbmcgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgcGFkZGluZy5jbGFzc05hbWUgPSAnYm90dG9tUGFkZGluZyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHBhZGRpbmcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXByb2Nlc3NlcyBhbGwgcGhyYXNlc2V0IGVsZW1lbnRzIG9mIHRoZSBnaXZlbiByZWYsIGlmIHRoZWlyIGluZGV4IGhhcyBjaGFuZ2VkICovXHJcbiAgICBwdWJsaWMgcmVmcmVzaFBocmFzZXNldChyZWY6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTm90ZSwgdGhpcyBjb3VsZCBwb3RlbnRpYWxseSBidWcgb3V0IGlmIGEgcGhyYXNlc2V0J3MgZGVzY2VuZGFudCByZWZlcmVuY2VzXHJcbiAgICAgICAgLy8gdGhlIHNhbWUgcGhyYXNlc2V0IChyZWN1cnNpb24pLiBCdXQgdGhpcyBpcyBva2F5IGJlY2F1c2UgcGhyYXNlc2V0cyBzaG91bGRcclxuICAgICAgICAvLyBuZXZlciBpbmNsdWRlIHRoZW1zZWx2ZXMsIGV2ZW4gZXZlbnR1YWxseS5cclxuXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChgc3BhbltkYXRhLXR5cGU9cGhyYXNlc2V0XVtkYXRhLXJlZj0ke3JlZn1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goXyA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCAgICA9IF8gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBsZXQgbmV3RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3BocmFzZXNldCcpO1xyXG4gICAgICAgICAgICAgICAgbGV0IGNoYW5jZSAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddO1xyXG5cclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuc2V0QXR0cmlidXRlKCdyZWYnLCByZWYpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjaGFuY2UpXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NoYW5jZScsIGNoYW5jZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5wYXJlbnRFbGVtZW50IS5yZXBsYWNlQ2hpbGQobmV3RWxlbWVudCwgZWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKG5ld0VsZW1lbnQucGFyZW50RWxlbWVudCEpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdHRhY2hDb250cm9scygpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBzdGF0aWMgTm9kZUxpc3Qgb2YgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gcXVlcnkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IFF1ZXJ5IHN0cmluZyB0byBhZGQgb250byB0aGUgYHNwYW5gIHNlbGVjdG9yXHJcbiAgICAgKiBAcmV0dXJucyBOb2RlIGxpc3Qgb2YgYWxsIGVsZW1lbnRzIG1hdGNoaW5nIHRoZSBnaXZlbiBzcGFuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRFbGVtZW50c0J5UXVlcnkocXVlcnk6IHN0cmluZykgOiBOb2RlTGlzdFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuJHtxdWVyeX1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UncyByb290IERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlKCkgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UgaW4gdGhlIGVkaXRvciBhcyB0ZXh0LCBleGNsdWRpbmcgdGhlIGhpZGRlbiBwYXJ0cyAqL1xyXG4gICAgcHVibGljIGdldFRleHQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFsbCBwaHJhc2UgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHR5cGUsIGFuZCBzZXRzIHRoZWlyIHRleHQgdG8gZ2l2ZW4gdmFsdWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHR5cGUgT3JpZ2luYWwgWE1MIG5hbWUgb2YgZWxlbWVudHMgdG8gcmVwbGFjZSBjb250ZW50cyBvZlxyXG4gICAgICogQHBhcmFtIHZhbHVlIE5ldyB0ZXh0IGZvciB0aGUgZm91bmQgZWxlbWVudHMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRFbGVtZW50c1RleHQodHlwZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT0ke3R5cGV9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIGFueSBjdXJyZW50bHkgb3BlbiBlZGl0b3IgZGlhbG9ncyAqL1xyXG4gICAgcHVibGljIGNsb3NlRGlhbG9nKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmNsb3NlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcucmVtb3ZlQXR0cmlidXRlKCdlZGl0aW5nJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScsICdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgYXR0YWNoZXMgVUkgY29udHJvbHMgZm9yIGNlcnRhaW4gcGhyYXNlIGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIGF0dGFjaENvbnRyb2xzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtdHlwZT1waHJhc2VzZXRdJykuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAgICAgIFBocmFzZXNldEJ1dHRvbi5jcmVhdGVBbmRBdHRhY2goc3BhbilcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1jaGFuY2VdJykuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5jcmVhdGVBbmRBdHRhY2goc3Bhbik7XHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLnVwZGF0ZShzcGFuIGFzIEhUTUxFbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhIGNsaWNrIGFueXdoZXJlIGluIHRoZSB3aW5kb3cgZGVwZW5kaW5nIG9uIHRoZSBjb250ZXh0ICovXHJcbiAgICBwcml2YXRlIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHRhcmdldCA/IHRhcmdldC5kYXRhc2V0Wyd0eXBlJ10gICAgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgbGV0IHBpY2tlciA9IHR5cGUgICA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmICghdGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIG9mIGlubmVyIGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKCB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdpbm5lcicpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBpbm5lciBkb2N1bWVudCBvciB1bm93bmVkIGVsZW1lbnRcclxuICAgICAgICBpZiAoICFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGVsZW1lbnQgb2YgYWxyZWFkeSBvcGVuIHBpY2tlcnNcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlciApXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIuZG9tLmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbnkgb3BlbiBlZGl0b3JzXHJcbiAgICAgICAgbGV0IHByZXZUYXJnZXQgPSB0aGlzLmRvbUVkaXRpbmc7XHJcbiAgICAgICAgdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBEb24ndCBoYW5kbGUgcGhyYXNlIG9yIHBocmFzZXNldHMgLSBvbmx5IHZpYSB0aGVpciBidXR0b25zXHJcbiAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2UnIHx8IHR5cGUgPT09ICdwaHJhc2VzZXQnKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElmIGNsaWNraW5nIHRoZSBlbGVtZW50IGFscmVhZHkgYmVpbmcgZWRpdGVkLCBkb24ndCByZW9wZW5cclxuICAgICAgICBpZiAodGFyZ2V0ID09PSBwcmV2VGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCB0b2dnbGUgICAgICAgPSB0YXJnZXQuY2xvc2VzdCgnLnRvZ2dsZScpICAgICAgIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCBjaG9vc2VQaHJhc2UgPSB0YXJnZXQuY2xvc2VzdCgnLmNob29zZVBocmFzZScpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgY29sbGFwc2libGUgZWxlbWVudHNcclxuICAgICAgICBpZiAodG9nZ2xlKVxyXG4gICAgICAgICAgICB0aGlzLnRvZ2dsZUNvbGxhcHNpYWJsZSh0b2dnbGUpO1xyXG5cclxuICAgICAgICAvLyBTcGVjaWFsIGNhc2UgZm9yIHBocmFzZXNldCBjaG9vc2VyXHJcbiAgICAgICAgZWxzZSBpZiAoY2hvb3NlUGhyYXNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gVE9ETzogQXNzZXJ0IGhlcmU/XHJcbiAgICAgICAgICAgIHRhcmdldCA9IGNob29zZVBocmFzZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgcGlja2VyID0gUkFHLnZpZXdzLmdldFBpY2tlcih0YXJnZXQuZGF0YXNldFsndHlwZSddISk7XHJcbiAgICAgICAgICAgIHRoaXMub3BlblBpY2tlcih0YXJnZXQsIHBpY2tlcik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBGaW5kIGFuZCBvcGVuIHBpY2tlciBmb3IgdGhlIHRhcmdldCBlbGVtZW50XHJcbiAgICAgICAgZWxzZSBpZiAodHlwZSAmJiBwaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMub3BlblBpY2tlcih0YXJnZXQsIHBpY2tlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlLWxheW91dCB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIG9uIHJlc2l6ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblJlc2l6ZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiBzY3JvbGwgKi9cclxuICAgIHByaXZhdGUgb25TY3JvbGwoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGxheW91dCBiZWhhdmluZyB3ZWlyZCB3aGVuIGlPUyBrZXlib2FyZCBpcyBvcGVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyLmhhc0ZvY3VzKCkpXHJcbiAgICAgICAgICAgIERPTS5ibHVyQWN0aXZlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZsaXBzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlLCBhbmQgcHJvcGFnYXRlcyB0aGUgbmV3IHN0YXRlIHRvIG90aGVyXHJcbiAgICAgKiBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmZXJlbmNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgQ29sbGFwc2libGUgZWxlbWVudCBiZWluZyB0b2dnbGVkXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdG9nZ2xlQ29sbGFwc2lhYmxlKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCByZWYgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCB0eXBlICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3R5cGUnKTtcclxuICAgICAgICBsZXQgY29sbGFwYXNlZCA9IHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG5cclxuICAgICAgICAvLyBQcm9wYWdhdGUgbmV3IGNvbGxhcHNlIHN0YXRlIHRvIGFsbCBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgYHNwYW5bZGF0YS10eXBlPSR7dHlwZX1dW2RhdGEtcmVmPSR7cmVmfV1bZGF0YS1jaGFuY2VdYFxyXG4gICAgICAgICkuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIENvbGxhcHNpYmxlcy5zZXQoc3BhbiBhcyBIVE1MRWxlbWVudCwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUudXBkYXRlKHNwYW4gYXMgSFRNTEVsZW1lbnQpO1xyXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3QgbW92ZSB0aGlzIHRvIENvbGxhcHNpYmxlcy5zZXQsIGFzIHN0YXRlIHNhdmUvbG9hZCBpcyBoYW5kbGVkXHJcbiAgICAgICAgICAgICAgICAvLyBvdXRzaWRlIGluIGJvdGggdXNhZ2VzIG9mIHNldENvbGxhcHNpYmxlLlxyXG4gICAgICAgICAgICAgICAgUkFHLnN0YXRlLnNldENvbGxhcHNlZChyZWYsICFjb2xsYXBhc2VkKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVucyBhIHBpY2tlciBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFZGl0b3IgZWxlbWVudCB0byBvcGVuIHRoZSBwaWNrZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gcGlja2VyIFBpY2tlciB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb3BlblBpY2tlcih0YXJnZXQ6IEhUTUxFbGVtZW50LCBwaWNrZXI6IFBpY2tlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGFyZ2V0LnNldEF0dHJpYnV0ZSgnZWRpdGluZycsICd0cnVlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlciA9IHBpY2tlcjtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgICAgPSB0YXJnZXQ7XHJcbiAgICAgICAgcGlja2VyLm9wZW4odGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzY3JvbGxpbmcgbWFycXVlZSAqL1xyXG5jbGFzcyBNYXJxdWVlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1hcnF1ZWUncyBET00gZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzcGFuIGVsZW1lbnQgaW4gdGhlIG1hcnF1ZWUsIHdoZXJlIHRoZSB0ZXh0IGlzIHNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21TcGFuIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSBJRCBmb3IgdGhlIHNjcm9sbGluZyBhbmltYXRpb24gdGltZXIgKi9cclxuICAgIHByaXZhdGUgdGltZXIgIDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBDdXJyZW50IG9mZnNldCAoaW4gcGl4ZWxzKSBvZiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuICAgIHByaXZhdGUgb2Zmc2V0IDogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICA9IERPTS5yZXF1aXJlKCcjbWFycXVlZScpO1xyXG4gICAgICAgIHRoaXMuZG9tU3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQodGhpcy5kb21TcGFuKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgbWVzc2FnZSBvbiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUsIGFuZCBzdGFydHMgYW5pbWF0aW5nIGl0ICovXHJcbiAgICBwdWJsaWMgc2V0KG1zZzogc3RyaW5nLCBhbmltYXRlOiBib29sZWFuID0gdHJ1ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNwYW4udGV4dENvbnRlbnQgICAgID0gbXNnO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuXHJcbiAgICAgICAgaWYgKCFhbmltYXRlKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEkgdHJpZWQgdG8gdXNlIENTUyBhbmltYXRpb24gZm9yIHRoaXMsIGJ1dCBjb3VsZG4ndCBmaWd1cmUgb3V0IGhvdyBmb3IgYVxyXG4gICAgICAgIC8vIGR5bmFtaWNhbGx5IHNpemVkIGVsZW1lbnQgbGlrZSB0aGUgc3Bhbi5cclxuICAgICAgICB0aGlzLm9mZnNldCA9IHRoaXMuZG9tLmNsaWVudFdpZHRoO1xyXG4gICAgICAgIGxldCBsaW1pdCAgID0gLXRoaXMuZG9tU3Bhbi5jbGllbnRXaWR0aCAtIDEwMDtcclxuICAgICAgICBsZXQgYW5pbSAgICA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm9mZnNldCAgICAgICAgICAgICAgICAgIC09IDY7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gID0gYHRyYW5zbGF0ZVgoJHt0aGlzLm9mZnNldH1weClgO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub2Zmc2V0IDwgbGltaXQpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW0pO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHRoZSBjdXJyZW50IG1hcnF1ZWUgYW5pbWF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnRpbWVyKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLzxyZWZlcmVuY2UgcGF0aD1cInZpZXdCYXNlLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuY2xhc3MgU2V0dGluZ3MgZXh0ZW5kcyBWaWV3QmFzZVxyXG57XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blJlc2V0ICAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuUmVzZXRTZXR0aW5ncycpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5TYXZlICAgICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTEJ1dHRvbkVsZW1lbnQ+ICgnI2J0blNhdmVTZXR0aW5ncycpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBjaGtVc2VWb3ggICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI2Noa1VzZVZveCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBoaW50VXNlVm94ICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTEVsZW1lbnQ+ICAgICAgICgnI2hpbnRVc2VWb3gnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsVm94Vm9pY2UgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxWb3hWb2ljZScpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dFZveFBhdGggICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI2lucHV0Vm94UGF0aCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hSZXZlcmIgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveFJldmVyYicpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hDaGltZSAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveENoaW1lJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFNwZWVjaFZvaWNlICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsU3BlZWNoQ2hvaWNlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJhbmdlU3BlZWNoVm9sICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjcmFuZ2VTcGVlY2hWb2wnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hQaXRjaCA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFBpdGNoJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJhbmdlU3BlZWNoUmF0ZSAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjcmFuZ2VTcGVlY2hSYXRlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blNwZWVjaFRlc3QgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuU3BlZWNoVGVzdCcpO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHRpbWVyIGZvciB0aGUgXCJSZXNldFwiIGJ1dHRvbiBjb25maXJtYXRpb24gc3RlcCAqL1xyXG4gICAgcHJpdmF0ZSByZXNldFRpbWVvdXQ/IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJyNzZXR0aW5nc1NjcmVlbicpO1xyXG4gICAgICAgIC8vIFRPRE86IENoZWNrIGlmIFZPWCBpcyBhdmFpbGFibGUsIGRpc2FibGUgaWYgbm90XHJcblxyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQub25jbGljayAgICAgID0gdGhpcy5oYW5kbGVSZXNldC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5vbmNsaWNrICAgICAgID0gdGhpcy5oYW5kbGVTYXZlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5jaGtVc2VWb3gub25jaGFuZ2UgICAgPSB0aGlzLmxheW91dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuc2VsVm94Vm9pY2Uub25jaGFuZ2UgID0gdGhpcy5sYXlvdXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3Qub25jbGljayA9IHRoaXMuaGFuZGxlVm9pY2VUZXN0LmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIFBvcHVsYXRlIGxpc3Qgb2YgaW1wdWxzZSByZXNwb25zZSBmaWxlc1xyXG4gICAgICAgIERPTS5wb3B1bGF0ZSh0aGlzLnNlbFZveFJldmVyYiwgVm94RW5naW5lLlJFVkVSQlMsIFJBRy5jb25maWcudm94UmV2ZXJiKTtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGUgdGhlIGxlZ2FsICYgYWNrbm93bGVkZ2VtZW50cyBibG9ja1xyXG4gICAgICAgIExpbmtkb3duLmxvYWRJbnRvKCdBQk9VVC5tZCcsICcjYWJvdXRCbG9jaycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBPcGVucyB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgb3BlbigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRoZSB2b2ljZSBsaXN0IGhhcyB0byBiZSBwb3B1bGF0ZWQgZWFjaCBvcGVuLCBpbiBjYXNlIGl0IGNoYW5nZXNcclxuICAgICAgICB0aGlzLnBvcHVsYXRlVm9pY2VMaXN0KCk7XHJcblxyXG4gICAgICAgIGlmICghUkFHLnNwZWVjaC52b3hBdmFpbGFibGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBUT0RPIDogTG9jYWxpemVcclxuICAgICAgICAgICAgdGhpcy5jaGtVc2VWb3guY2hlY2tlZCAgICA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmNoa1VzZVZveC5kaXNhYmxlZCAgID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5oaW50VXNlVm94LmlubmVySFRNTCA9ICc8c3Ryb25nPlZPWCBlbmdpbmU8L3N0cm9uZz4gaXMgdW5hdmFpbGFibGUuJyArXHJcbiAgICAgICAgICAgICAgICAnIFlvdXIgYnJvd3NlciBvciBkZXZpY2UgbWF5IG5vdCBiZSBzdXBwb3J0ZWQ7IHBsZWFzZSBjaGVjayB0aGUgY29uc29sZScgK1xyXG4gICAgICAgICAgICAgICAgJyBmb3IgbW9yZSBpbmZvcm1hdGlvbi4nO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuY2hrVXNlVm94LmNoZWNrZWQgPSBSQUcuY29uZmlnLnZveEVuYWJsZWQ7XHJcblxyXG4gICAgICAgIHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hQYXRoO1xyXG4gICAgICAgIHRoaXMuaW5wdXRWb3hQYXRoLnZhbHVlICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoO1xyXG4gICAgICAgIHRoaXMuc2VsVm94UmV2ZXJiLnZhbHVlICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hSZXZlcmI7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hDaGltZS52YWx1ZSAgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveENoaW1lO1xyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2UudmFsdWUgICAgICAgICAgID0gUkFHLmNvbmZpZy5zcGVlY2hWb2ljZTtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlQXNOdW1iZXIgICA9IFJBRy5jb25maWcuc3BlZWNoVm9sO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyID0gUkFHLmNvbmZpZy5zcGVlY2hQaXRjaDtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZUFzTnVtYmVyICA9IFJBRy5jb25maWcuc3BlZWNoUmF0ZTtcclxuXHJcbiAgICAgICAgdGhpcy5sYXlvdXQoKTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gICAgICAgPSBmYWxzZTtcclxuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYWluLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiAgICAgICA9IHRydWU7XHJcbiAgICAgICAgUkFHLnZpZXdzLnRvb2xiYXIuYnRuT3B0aW9uLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGN1bGF0ZXMgZm9ybSBsYXlvdXQgYW5kIGNvbnRyb2wgdmlzaWJpbGl0eSBiYXNlZCBvbiBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBsYXlvdXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgdm94RW5hYmxlZCA9IHRoaXMuY2hrVXNlVm94LmNoZWNrZWQ7XHJcbiAgICAgICAgbGV0IHZveEN1c3RvbSAgPSAodGhpcy5zZWxWb3hWb2ljZS52YWx1ZSA9PT0gJycpO1xyXG5cclxuICAgICAgICBET00udG9nZ2xlSGlkZGVuQWxsKFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxTcGVlY2hWb2ljZSwgICAhdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnJhbmdlU3BlZWNoUGl0Y2gsICF2b3hFbmFibGVkXSxcclxuICAgICAgICAgICAgW3RoaXMuc2VsVm94Vm9pY2UsICAgICAgIHZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5pbnB1dFZveFBhdGgsICAgICAgdm94RW5hYmxlZCAmJiB2b3hDdXN0b21dLFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxWb3hSZXZlcmIsICAgICAgdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnNlbFZveENoaW1lLCAgICAgICB2b3hFbmFibGVkXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbmQgcG9wdWxhdGVzIHRoZSB2b2ljZSBsaXN0ICovXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlVm9pY2VMaXN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgbGV0IHZvaWNlcyA9IFJBRy5zcGVlY2guYnJvd3NlclZvaWNlcztcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGxpc3RcclxuICAgICAgICBpZiAodm9pY2VzID09PSB7fSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBvcHRpb24gICAgICA9IERPTS5hZGRPcHRpb24odGhpcy5zZWxTcGVlY2hWb2ljZSwgTC5TVF9TUEVFQ0hfRU1QVFkpO1xyXG4gICAgICAgICAgICBvcHRpb24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvU3BlZWNoU3ludGhlc2lzXHJcbiAgICAgICAgZWxzZSBmb3IgKGxldCBuYW1lIGluIHZvaWNlcylcclxuICAgICAgICAgICAgRE9NLmFkZE9wdGlvbih0aGlzLnNlbFNwZWVjaFZvaWNlLCBgJHtuYW1lfSAoJHt2b2ljZXNbbmFtZV0ubGFuZ30pYCwgbmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHJlc2V0IGJ1dHRvbiwgd2l0aCBhIGNvbmZpcm0gc3RlcCB0aGF0IGNhbmNlbHMgYWZ0ZXIgMTUgc2Vjb25kcyAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVSZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5yZXNldFRpbWVvdXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHNldFRpbWVvdXQodGhpcy5jYW5jZWxSZXNldC5iaW5kKHRoaXMpLCAxNTAwMCk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuUmVzZXQuaW5uZXJUZXh0ID0gTC5TVF9SRVNFVF9DT05GSVJNO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfQ09ORklSTV9UO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuY29uZmlnLnJlc2V0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIHRoaXMub3BlbigpO1xyXG4gICAgICAgIGFsZXJ0KEwuU1RfUkVTRVRfRE9ORSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbmNlbCB0aGUgcmVzZXQgdGltZW91dCBhbmQgcmVzdG9yZSB0aGUgcmVzZXQgYnV0dG9uIHRvIG5vcm1hbCAqL1xyXG4gICAgcHJpdmF0ZSBjYW5jZWxSZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5yZXNldFRpbWVvdXQpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQuaW5uZXJUZXh0ID0gTC5TVF9SRVNFVDtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfVDtcclxuICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2F2ZSBidXR0b24sIHNhdmluZyBjb25maWcgdG8gc3RvcmFnZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVTYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hFbmFibGVkICAgID0gdGhpcy5jaGtVc2VWb3guY2hlY2tlZDtcclxuICAgICAgICBSQUcuY29uZmlnLnZveFBhdGggICAgICAgPSB0aGlzLnNlbFZveFZvaWNlLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94Q3VzdG9tUGF0aCA9IHRoaXMuaW5wdXRWb3hQYXRoLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94UmV2ZXJiICAgICA9IHRoaXMuc2VsVm94UmV2ZXJiLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94Q2hpbWUgICAgICA9IHRoaXMuc2VsVm94Q2hpbWUudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSAgID0gdGhpcy5zZWxTcGVlY2hWb2ljZS52YWx1ZTtcclxuICAgICAgICAvLyBwYXJzZUZsb2F0IGluc3RlYWQgb2YgdmFsdWVBc051bWJlcjsgc2VlIEFyY2hpdGVjdHVyZS5tZFxyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoVm9sICAgICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hQaXRjaCAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSAgICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFJhdGUudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc2F2ZSgpO1xyXG4gICAgICAgIHRoaXMuY2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc3BlZWNoIHRlc3QgYnV0dG9uLCBzcGVha2luZyBhIHRlc3QgcGhyYXNlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVZvaWNlVGVzdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0LmRpc2FibGVkID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gSGFzIHRvIGV4ZWN1dGUgb24gYSBkZWxheSwgYXMgc3BlZWNoIGNhbmNlbCBpcyB1bnJlbGlhYmxlIHdpdGhvdXQgaXRcclxuICAgICAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0LmRpc2FibGVkID0gZmFsc2U7XHJcblxyXG4gICAgICAgICAgICBsZXQgcGhyYXNlICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lckhUTUwgPSAnPHBocmFzZSByZWY9XCJzYW1wbGVcIi8+JztcclxuXHJcbiAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MocGhyYXNlKTtcclxuXHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3BlYWsoXHJcbiAgICAgICAgICAgICAgICBwaHJhc2UuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHVzZVZveCAgICA6IHRoaXMuY2hrVXNlVm94LmNoZWNrZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94UGF0aCAgIDogdGhpcy5zZWxWb3hWb2ljZS52YWx1ZSB8fCB0aGlzLmlucHV0Vm94UGF0aC52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICB2b3hSZXZlcmIgOiB0aGlzLnNlbFZveFJldmVyYi52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICB2b3hDaGltZSAgOiB0aGlzLnNlbFZveENoaW1lLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHZvaWNlTmFtZSA6IHRoaXMuc2VsU3BlZWNoVm9pY2UudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm9sdW1lICAgIDogdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHBpdGNoICAgICA6IHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHJhdGUgICAgICA6IHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXJcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9LCAyMDApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXG5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ2aWV3QmFzZS50c1wiLz5cblxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0ZSBzYXZlL2xvYWQgcGlja2VyIGRpYWxvZyAqL1xuY2xhc3MgU3RhdGVQaWNrZXIgZXh0ZW5kcyBWaWV3QmFzZVxue1xuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXROdW1iZXIgIDogSFRNTElucHV0RWxlbWVudDtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TmFtZSAgICA6IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21QcmV2aWV3ICAgOiBIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIHJlYWRvbmx5IHBXYXJuaW5nICAgICA6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQWN0aW9uICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5EZWxldGUgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkNhbmNlbCAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGlzdCAgICAgIDogSFRNTFVMaXN0RWxlbWVudDtcblxuICAgIHByaXZhdGUgbW9kZTogJ3NhdmUnIHwgJ2xvYWQnID0gJ3NhdmUnO1xuICAgIHByaXZhdGUgc3RhdGVzOiB7IFtrZXk6IG51bWJlcl06IHsgbmFtZTogc3RyaW5nLCBkYXRhOiBzdHJpbmcgfSB9ID0ge307XG5cbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxuICAgIHtcbiAgICAgICAgc3VwZXIoJyNzdGF0ZVBpY2tlcicpO1xuXG4gICAgICAgIHRoaXMuaW5wdXROdW1iZXIgPSB0aGlzLmF0dGFjaDxIVE1MSW5wdXRFbGVtZW50PignI3N0YXRlUGlja2VyVmFsdWUnKTtcbiAgICAgICAgdGhpcy5pbnB1dE5hbWUgICA9IHRoaXMuYXR0YWNoPEhUTUxJbnB1dEVsZW1lbnQ+KCcjc3RhdGVQaWNrZXJOYW1lJyk7XG4gICAgICAgIHRoaXMuZG9tUHJldmlldyAgPSB0aGlzLmF0dGFjaDxIVE1MRWxlbWVudD4oJyNzdGF0ZVBpY2tlclByZXZpZXcnKTtcbiAgICAgICAgdGhpcy5wV2FybmluZyAgICA9IHRoaXMuYXR0YWNoPEhUTUxFbGVtZW50PignI3N0YXRlUGlja2VyV2FybmluZycpO1xuICAgICAgICB0aGlzLmJ0bkFjdGlvbiAgID0gdGhpcy5hdHRhY2g8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcjYnRuU3RhdGVBY3Rpb24nKTtcbiAgICAgICAgdGhpcy5idG5EZWxldGUgICA9IHRoaXMuYXR0YWNoPEhUTUxCdXR0b25FbGVtZW50PignI2J0blN0YXRlRGVsZXRlJyk7XG4gICAgICAgIHRoaXMuYnRuQ2FuY2VsICAgPSB0aGlzLmF0dGFjaDxIVE1MQnV0dG9uRWxlbWVudD4oJyNidG5TdGF0ZUNhbmNlbCcpO1xuICAgICAgICB0aGlzLmRvbUxpc3QgICAgID0gdGhpcy5hdHRhY2g8SFRNTFVMaXN0RWxlbWVudD4oJyNzdGF0ZVBpY2tlckxpc3QnKTtcblxuICAgICAgICB0aGlzLmJ0bkFjdGlvbi5vbmNsaWNrID0gdGhpcy5oYW5kbGVBY3Rpb24uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5idG5EZWxldGUub25jbGljayA9IHRoaXMuaGFuZGxlRGVsZXRlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnRuQ2FuY2VsLm9uY2xpY2sgPSB0aGlzLmNsb3NlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuaW5wdXROdW1iZXIub25pbnB1dCA9IHRoaXMuaGFuZGxlSW5wdXQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5pbnB1dE5hbWUub25pbnB1dCA9IHRoaXMuaGFuZGxlTmFtZUlucHV0LmJpbmQodGhpcyk7XG4gICAgICAgIFxuICAgICAgICAvLyBMb2FkIGluaXRpYWwgc3RhdGVzIGZyb20gbG9jYWxTdG9yYWdlXG4gICAgICAgIHRoaXMubG9hZFN0YXRlcygpO1xuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIGxvYWRTdGF0ZXMoKTogdm9pZCB7XG4gICAgICAgIGxldCByYXcgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3N0YXRlcycpO1xuICAgICAgICBpZiAocmF3KSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGxldCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdyk7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZXMgPSB7fTtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBrZXkgaW4gcGFyc2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB2YWwgPSBwYXJzZWRba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlc1twYXJzZUludChrZXkpXSA9IHsgbmFtZTogYFN0YXRlICR7a2V5fWAsIGRhdGE6IHZhbCB9O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZXNbcGFyc2VJbnQoa2V5KV0gPSB2YWw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZXMgPSB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc3RhdGVzID0ge307XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcHJpdmF0ZSBzYXZlU3RhdGVzKCk6IHZvaWQge1xuICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3N0YXRlcycsIEpTT04uc3RyaW5naWZ5KHRoaXMuc3RhdGVzKSk7XG4gICAgfVxuXG4gICAgcHVibGljIG9wZW4obW9kZTogJ3NhdmUnIHwgJ2xvYWQnKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMubG9hZFN0YXRlcygpO1xuICAgICAgICB0aGlzLm1vZGUgPSBtb2RlO1xuICAgICAgICB0aGlzLmlucHV0TnVtYmVyLnZhbHVlID0gJyc7XG4gICAgICAgIHRoaXMuaW5wdXROYW1lLnZhbHVlID0gJyc7XG4gICAgICAgIHRoaXMuZG9tUHJldmlldy5pbm5lclRleHQgPSAnJztcbiAgICAgICAgdGhpcy5wV2FybmluZy5oaWRkZW4gPSB0cnVlO1xuICAgICAgICBcbiAgICAgICAgaWYgKHRoaXMubW9kZSA9PT0gJ3NhdmUnKSB7XG4gICAgICAgICAgICB0aGlzLmJ0bkFjdGlvbi5pbm5lclRleHQgPSAnU2F2ZSc7XG4gICAgICAgICAgICB0aGlzLmJ0bkFjdGlvbi5kaXNhYmxlZCA9IHRydWU7IC8vIFdhaXQgZm9yIHZhbGlkIGlucHV0XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmJ0bkFjdGlvbi5pbm5lclRleHQgPSAnTG9hZCc7XG4gICAgICAgICAgICB0aGlzLmJ0bkFjdGlvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmJ0bkRlbGV0ZS5oaWRkZW4gPSB0cnVlO1xuICAgICAgICBcbiAgICAgICAgdGhpcy5sYXlvdXQoKTtcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuID0gZmFsc2U7XG4gICAgICAgIFxuICAgICAgICAvLyBQcmV2ZW50IGludGVyYWN0aW9uIHdpdGggcmVzdCBvZiBVSSB3aGlsZSBtb2RhbCBpcyBvcGVuXG4gICAgICAgIFJBRy52aWV3cy5tYWluLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG4gICAgICAgIFxuICAgICAgICB0aGlzLnJlZnJlc2hMaXN0KCk7XG4gICAgICAgIHRoaXMuaW5wdXROdW1iZXIuZm9jdXMoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlZnJlc2hMaXN0KCk6IHZvaWQge1xuICAgICAgICB0aGlzLmRvbUxpc3QuaW5uZXJIVE1MID0gJyc7XG4gICAgICAgIGxldCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5zdGF0ZXMpLm1hcChrID0+IHBhcnNlSW50KGspKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG4gICAgICAgIFxuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGxldCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgICAgICBsaS5pbm5lclRleHQgPSAnTm8gc3RhdGVzIHNhdmVkIHlldC4nO1xuICAgICAgICAgICAgbGkuc3R5bGUucGFkZGluZyA9ICc1cHgnO1xuICAgICAgICAgICAgbGkuc3R5bGUuY29sb3IgPSAnIzg4OCc7XG4gICAgICAgICAgICB0aGlzLmRvbUxpc3QuYXBwZW5kQ2hpbGQobGkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAga2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgICBsZXQgc3RhdGVPYmogPSB0aGlzLnN0YXRlc1trZXldO1xuICAgICAgICAgICAgbGV0IG5hbWUgPSBzdGF0ZU9iai5uYW1lIHx8IGBTdGF0ZSAke2tleX1gO1xuICAgICAgICAgICAgbGV0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIGxpLmlubmVyVGV4dCA9IGAke2tleX06ICR7bmFtZX1gO1xuICAgICAgICAgICAgbGkuc3R5bGUucGFkZGluZyA9ICc1cHgnO1xuICAgICAgICAgICAgbGkuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuICAgICAgICAgICAgbGkuc3R5bGUuYm9yZGVyQm90dG9tID0gJzFweCBzb2xpZCAjNDQ0JztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbGkub25tb3VzZW92ZXIgPSAoKSA9PiBsaS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAnIzQ0NCc7XG4gICAgICAgICAgICBsaS5vbm1vdXNlb3V0ID0gKCkgPT4gbGkuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbGkub25jbGljayA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0TnVtYmVyLnZhbHVlID0ga2V5LnRvU3RyaW5nKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVJbnB1dCgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuZG9tTGlzdC5hcHBlbmRDaGlsZChsaSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBjbG9zZShldj86IEV2ZW50KSA6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmIChldikgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuID0gdHJ1ZTtcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uc3R5bGUucG9pbnRlckV2ZW50cyA9ICcnO1xuICAgICAgICBcbiAgICAgICAgaWYgKHRoaXMubW9kZSA9PT0gJ3NhdmUnKSB7XG4gICAgICAgICAgICBSQUcudmlld3MudG9vbGJhci5idG5TYXZlLmZvY3VzKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBSQUcudmlld3MudG9vbGJhci5idG5SZWNhbGwuZm9jdXMoKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIGxheW91dCgpIDogdm9pZCB7XG4gICAgICAgIGxldCBkb2NXICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aDtcbiAgICAgICAgbGV0IGRvY0ggICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodDtcbiAgICAgICAgbGV0IGRpYWxvZ1ggICAgPSBET00uaXNNb2JpbGUgPyAwIDogKCAoZG9jVyAqIDAuMSkgLyAyICkgfCAwO1xuICAgICAgICBsZXQgZGlhbG9nWSAgICA9IERPTS5pc01vYmlsZSA/IDAgOiAoIChkb2NIICogMC4xKSAvIDIgKSB8IDA7XG4gICAgICAgIFxuICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKSB7XG4gICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCA9IGAxMDAlYDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy5kb20uc3R5bGUubGVmdCA9IGRpYWxvZ1ggKyAncHgnO1xuICAgICAgICB0aGlzLmRvbS5zdHlsZS50b3AgID0gZGlhbG9nWSArICdweCc7XG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLnpJbmRleCA9ICc5OTk5JztcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZU5hbWVJbnB1dCgpOiB2b2lkIHtcbiAgICAgICAgLy8gSnVzdCB0cmlnZ2VyIGlucHV0IGhhbmRsZXIgaWYgaW4gc2F2ZSBtb2RlLCBhcyBuYW1lIGFmZmVjdHMgbm90aGluZyBpbiBsb2FkXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoYW5kbGVJbnB1dCgpOiB2b2lkIHtcbiAgICAgICAgbGV0IHZhbCA9IHBhcnNlSW50KHRoaXMuaW5wdXROdW1iZXIudmFsdWUpO1xuICAgICAgICBpZiAoaXNOYU4odmFsKSB8fCB2YWwgPCAxKSB7XG4gICAgICAgICAgICB0aGlzLmJ0bkFjdGlvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmJ0bkRlbGV0ZS5oaWRkZW4gPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5wV2FybmluZy5oaWRkZW4gPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5kb21QcmV2aWV3LmlubmVyVGV4dCA9ICcnO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBsZXQgc3RhdGVPYmogPSB0aGlzLnN0YXRlc1t2YWxdO1xuICAgICAgICBsZXQgZXhpc3RzID0gKHN0YXRlT2JqICE9PSB1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLmJ0bkRlbGV0ZS5oaWRkZW4gPSAhZXhpc3RzO1xuICAgICAgICBcbiAgICAgICAgaWYgKGV4aXN0cykge1xuICAgICAgICAgICAgdGhpcy5kb21QcmV2aWV3LmlubmVyVGV4dCA9IHRoaXMucHJldmlld1N0YXRlVGV4dChzdGF0ZU9iai5kYXRhKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZG9tUHJldmlldy5pbm5lclRleHQgPSAnJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKHRoaXMubW9kZSA9PT0gJ3NhdmUnKSB7XG4gICAgICAgICAgICB0aGlzLmJ0bkFjdGlvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5wV2FybmluZy5oaWRkZW4gPSAhZXhpc3RzO1xuICAgICAgICAgICAgaWYgKGV4aXN0cykge1xuICAgICAgICAgICAgICAgIHRoaXMucFdhcm5pbmcuaW5uZXJUZXh0ID0gJ1dhcm5pbmc6IFN0YXRlIGFscmVhZHkgZXhpc3RzIGFuZCB3aWxsIGJlIG92ZXJ3cml0dGVuISc7XG4gICAgICAgICAgICAgICAgdGhpcy5wV2FybmluZy5zdHlsZS5jb2xvciA9ICcjZmZhYTAwJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIExvYWQgbW9kZVxuICAgICAgICAgICAgdGhpcy5idG5BY3Rpb24uZGlzYWJsZWQgPSAhZXhpc3RzO1xuICAgICAgICAgICAgdGhpcy5wV2FybmluZy5oaWRkZW4gPSBleGlzdHM7IC8vIElmIGRvZXNuJ3QgZXhpc3QsIHNob3cgd2FybmluZ1xuICAgICAgICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBXYXJuaW5nLmlubmVyVGV4dCA9ICdTdGF0ZSBkb2VzIG5vdCBleGlzdC4nO1xuICAgICAgICAgICAgICAgIHRoaXMucFdhcm5pbmcuc3R5bGUuY29sb3IgPSAnI2ZmNTU1NSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHByZXZpZXdTdGF0ZVRleHQoc3RhdGVKc29uOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IG9sZFN0YXRlID0gUkFHLnN0YXRlO1xuICAgICAgICAgICAgUkFHLnN0YXRlID0gT2JqZWN0LmFzc2lnbihuZXcgU3RhdGUoKSwgSlNPTi5wYXJzZShzdGF0ZUpzb24pKSBhcyBTdGF0ZTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbGV0IHRlbXBEb20gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHRlbXBEb20uaW5uZXJIVE1MID0gJzxwaHJhc2VzZXQgcmVmPVwicm9vdFwiIC8+JztcbiAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3ModGVtcERvbSk7XG4gICAgICAgICAgICBsZXQgY29tcGlsZWRUZXh0ID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dCh0ZW1wRG9tKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgUkFHLnN0YXRlID0gb2xkU3RhdGU7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBjb21waWxlZFRleHQ7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBcIkVycm9yIGNvbXBpbGluZyBwcmV2aWV3OiBcIiArIGUubWVzc2FnZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlQWN0aW9uKGV2OiBFdmVudCk6IHZvaWQge1xuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBsZXQgdmFsID0gcGFyc2VJbnQodGhpcy5pbnB1dE51bWJlci52YWx1ZSk7XG4gICAgICAgIGlmIChpc05hTih2YWwpIHx8IHZhbCA8IDEpIHJldHVybjtcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLm1vZGUgPT09ICdzYXZlJykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBsZXQgbmFtZSA9IHRoaXMuaW5wdXROYW1lLnZhbHVlLnRyaW0oKSB8fCBgU3RhdGUgJHt2YWx9YDtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlc1t2YWxdID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVTdGF0ZXMoKTtcbiAgICAgICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoYFNhdmVkIHRvIFN0YXRlICR7dmFsfWApO1xuICAgICAgICAgICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfU0FWRV9GQUlMKGUubWVzc2FnZSkgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBzdGF0ZU9iaiA9IHRoaXMuc3RhdGVzW3ZhbF07XG4gICAgICAgICAgICBpZiAoc3RhdGVPYmogJiYgc3RhdGVPYmouZGF0YSkge1xuICAgICAgICAgICAgICAgIFJBRy5sb2FkKHN0YXRlT2JqLmRhdGEpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIGhhbmRsZURlbGV0ZShldjogRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgbGV0IHZhbCA9IHBhcnNlSW50KHRoaXMuaW5wdXROdW1iZXIudmFsdWUpO1xuICAgICAgICBpZiAoaXNOYU4odmFsKSB8fCB2YWwgPCAxKSByZXR1cm47XG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5zdGF0ZXNbdmFsXSkge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuc3RhdGVzW3ZhbF07XG4gICAgICAgICAgICB0aGlzLnNhdmVTdGF0ZXMoKTtcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChgRGVsZXRlZCBTdGF0ZSAke3ZhbH1gKTtcbiAgICAgICAgICAgIHRoaXMuaW5wdXROdW1iZXIudmFsdWUgPSAnJztcbiAgICAgICAgICAgIHRoaXMucmVmcmVzaExpc3QoKTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlSW5wdXQoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0b3AgdG9vbGJhciAqL1xyXG5jbGFzcyBUb29sYmFyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGNvbnRhaW5lciBmb3IgdGhlIHRvb2xiYXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBsYXkgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blBsYXkgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzdG9wIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5TdG9wICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZ2VuZXJhdGUgcmFuZG9tIHBocmFzZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuR2VuZXJhdGUgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNhdmUgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGJ0blNhdmUgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSByZWNhbGwgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGJ0blJlY2FsbCAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzZXR0aW5ncyBidXR0b24gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgYnRuT3B0aW9uICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgPSBET00ucmVxdWlyZSgnI3Rvb2xiYXInKTtcclxuICAgICAgICB0aGlzLmJ0blBsYXkgICAgID0gRE9NLnJlcXVpcmUoJyNidG5QbGF5Jyk7XHJcbiAgICAgICAgdGhpcy5idG5TdG9wICAgICA9IERPTS5yZXF1aXJlKCcjYnRuU3RvcCcpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUgPSBET00ucmVxdWlyZSgnI2J0blNodWZmbGUnKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TYXZlJyk7XHJcbiAgICAgICAgdGhpcy5idG5SZWNhbGwgICA9IERPTS5yZXF1aXJlKCcjYnRuTG9hZCcpO1xyXG4gICAgICAgIHRoaXMuYnRuT3B0aW9uICAgPSBET00ucmVxdWlyZSgnI2J0blNldHRpbmdzJyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuUGxheS5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlUGxheS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU3RvcC5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlU3RvcC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUub25jbGljayA9IHRoaXMuaGFuZGxlR2VuZXJhdGUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blJlY2FsbC5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZUxvYWQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bk9wdGlvbi5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZU9wdGlvbi5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBBZGQgdGhyb2IgY2xhc3MgaWYgdGhlIGdlbmVyYXRlIGJ1dHRvbiBoYXNuJ3QgYmVlbiBjbGlja2VkIGJlZm9yZVxyXG4gICAgICAgIGlmICghUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5hZGQoJ3Rocm9iJyk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcGxheSBidXR0b24sIHBsYXlpbmcgdGhlIGVkaXRvcidzIGN1cnJlbnQgcGhyYXNlIHdpdGggc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVBsYXkoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICB0aGlzLmJ0blBsYXkuZGlzYWJsZWQgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBIYXMgdG8gZXhlY3V0ZSBvbiBhIGRlbGF5LCBvdGhlcndpc2UgbmF0aXZlIHNwZWVjaCBjYW5jZWwgYmVjb21lcyB1bnJlbGlhYmxlXHJcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQodGhpcy5oYW5kbGVQbGF5Mi5iaW5kKHRoaXMpLCAyMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDb250aW51YXRpb24gb2YgaGFuZGxlUGxheSwgZXhlY3V0ZWQgYWZ0ZXIgYSBkZWxheSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5MigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBoYXNTcG9rZW4gICAgICAgICA9IGZhbHNlO1xyXG4gICAgICAgIGxldCBzcGVlY2hUZXh0ICAgICAgICA9IFJBRy52aWV3cy5lZGl0b3IuZ2V0VGV4dCgpO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheS5oaWRkZW4gICA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5idG5QbGF5LmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5idG5TdG9wLmhpZGRlbiAgID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExvY2FsaXplXHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdMb2FkaW5nIFZPWC4uLicsIGZhbHNlKTtcclxuXHJcbiAgICAgICAgLy8gSWYgc3BlZWNoIHRha2VzIHRvbyBsb25nICgxMCBzZWNvbmRzKSB0byBsb2FkLCBjYW5jZWwgaXRcclxuICAgICAgICBsZXQgdGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIH0sIDEwICogMTAwMCk7XHJcblxyXG4gICAgICAgIFJBRy5zcGVlY2gub25zcGVhayA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChzcGVlY2hUZXh0KTtcclxuXHJcbiAgICAgICAgICAgIGhhc1Nwb2tlbiAgICAgICAgICA9IHRydWU7XHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2gub25zcGVhayA9IHVuZGVmaW5lZDtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XHJcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlU3RvcCgpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgYW55dGhpbmcgd2FzIGFjdHVhbGx5IHNwb2tlbi4gSWYgbm90LCBzb21ldGhpbmcgd2VudCB3cm9uZy5cclxuICAgICAgICAgICAgaWYgKCFoYXNTcG9rZW4gJiYgUkFHLmNvbmZpZy52b3hFbmFibGVkKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBSQUcuY29uZmlnLnZveEVuYWJsZWQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBMb2NhbGl6ZVxyXG4gICAgICAgICAgICAgICAgYWxlcnQoXHJcbiAgICAgICAgICAgICAgICAgICAgJ0l0IGFwcGVhcnMgdGhhdCB0aGUgVk9YIGVuZ2luZSB3YXMgdW5hYmxlIHRvIHNheSBhbnl0aGluZy4nICAgK1xyXG4gICAgICAgICAgICAgICAgICAgICcgRWl0aGVyIHRoZSBjdXJyZW50IHZvaWNlIHBhdGggaXMgdW5yZWFjaGFibGUsIG9yIHRoZSBlbmdpbmUnICtcclxuICAgICAgICAgICAgICAgICAgICAnIGNyYXNoZWQuIFBsZWFzZSBjaGVjayB0aGUgY29uc29sZS4gVGhlIFZPWCBlbmdpbmUgaGFzIGJlZW4nICArXHJcbiAgICAgICAgICAgICAgICAgICAgJyBkaXNhYmxlZCBhbmQgbmF0aXZlIHRleHQtdG8tc3BlZWNoIHdpbGwgYmUgdXNlZCBvbiBuZXh0IHBsYXkuJ1xyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmICghaGFzU3Bva2VuKVxyXG4gICAgICAgICAgICAgICAgYWxlcnQoXHJcbiAgICAgICAgICAgICAgICAgICAgJ0l0IGFwcGVhcnMgdGhhdCB0aGUgYnJvd3NlciB3YXMgdW5hYmxlIHRvIHNheSBhbnl0aGluZy4nICAgICAgICArXHJcbiAgICAgICAgICAgICAgICAgICAgJyBFaXRoZXIgdGhlIGN1cnJlbnQgdm9pY2UgZmFpbGVkIHRvIGxvYWQsIG9yIHRoaXMgYnJvd3NlciBkb2VzJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJyBub3Qgc3VwcG9ydCBzdXBwb3J0IHRleHQtdG8tc3BlZWNoLiBQbGVhc2UgY2hlY2sgdGhlIGNvbnNvbGUuJ1xyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFNpbmNlIHRoZSBtYXJxdWVlIHdvdWxkIGhhdmUgYmVlbiBzdHVjayBvbiBcIkxvYWRpbmcuLi5cIiwgc2Nyb2xsIGl0XHJcbiAgICAgICAgICAgIGlmICghaGFzU3Bva2VuKVxyXG4gICAgICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KHNwZWVjaFRleHQpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIFJBRy5zcGVlY2guc3BlYWsoIFJBRy52aWV3cy5lZGl0b3IuZ2V0UGhyYXNlKCkgKTtcclxuICAgICAgICB0aGlzLmJ0blN0b3AuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc3RvcCBidXR0b24sIHN0b3BwaW5nIHRoZSBtYXJxdWVlIGFuZCBhbnkgc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVN0b3AoZXY/OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5vbnNwZWFrICA9IHVuZGVmaW5lZDtcclxuICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheS5oaWRkZW4gPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gT25seSBmb2N1cyBwbGF5IGJ1dHRvbiBpZiB1c2VyIGRpZG4ndCBtb3ZlIGZvY3VzIGVsc2V3aGVyZS4gUHJldmVudHNcclxuICAgICAgICAvLyBhbm5veWluZyBzdXJwcmlzZSBvZiBmb2N1cyBzdWRkZW5seSBzaGlmdGluZyBhd2F5LlxyXG4gICAgICAgIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLmJ0blN0b3ApXHJcbiAgICAgICAgICAgIHRoaXMuYnRuUGxheS5mb2N1cygpO1xyXG5cclxuICAgICAgICB0aGlzLmJ0blN0b3AuaGlkZGVuID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcblxyXG4gICAgICAgIC8vIElmIGV2ZW50IGV4aXN0cywgdGhpcyBzdG9wIHdhcyBjYWxsZWQgYnkgdGhlIHVzZXJcclxuICAgICAgICBpZiAoZXYpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKSwgZmFsc2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBnZW5lcmF0ZSBidXR0b24sIGdlbmVyYXRpbmcgbmV3IHJhbmRvbSBzdGF0ZSBhbmQgcGhyYXNlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBjYWxsLXRvLWFjdGlvbiB0aHJvYiBmcm9tIGluaXRpYWwgbG9hZFxyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LnJlbW92ZSgndGhyb2InKTtcclxuICAgICAgICBSQUcuZ2VuZXJhdGUoKTtcclxuICAgICAgICBSQUcuY29uZmlnLmNsaWNrZWRHZW5lcmF0ZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNhdmUgYnV0dG9uLCBvcGVuaW5nIHRoZSBzdGF0ZSBwaWNrZXIgaW4gc2F2ZSBtb2RlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcudmlld3Muc3RhdGVQaWNrZXIub3Blbignc2F2ZScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBsb2FkIGJ1dHRvbiwgb3BlbmluZyB0aGUgc3RhdGUgcGlja2VyIGluIGxvYWQgbW9kZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVMb2FkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnZpZXdzLnN0YXRlUGlja2VyLm9wZW4oJ2xvYWQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2V0dGluZ3MgYnV0dG9uLCBvcGVuaW5nIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHByaXZhdGUgaGFuZGxlT3B0aW9uKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnZpZXdzLnNldHRpbmdzLm9wZW4oKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgVUkgZWxlbWVudHMgYW5kIHRoZWlyIGxvZ2ljICovXHJcbmNsYXNzIFZpZXdzXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG1haW4gICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gZGlzY2xhaW1lciBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZGlzY2xhaW1lciA6IERpc2NsYWltZXI7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIGVkaXRvciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZWRpdG9yICAgICA6IEVkaXRvcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gbWFycXVlZSBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbWFycXVlZSAgICA6IE1hcnF1ZWU7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXR0aW5ncyAgIDogU2V0dGluZ3M7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzdGF0ZSBwaWNrZXIgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHN0YXRlUGlja2VyOiBTdGF0ZVBpY2tlcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gdG9vbGJhciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgdG9vbGJhciAgICA6IFRvb2xiYXI7XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBhbGwgdGhlIHBpY2tlcnMsIG9uZSBmb3IgZWFjaCB0eXBlIG9mIFhNTCBlbGVtZW50ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHBpY2tlcnMgICAgOiBEaWN0aW9uYXJ5PFBpY2tlcj47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLm1haW4gICAgICAgPSBET00ucmVxdWlyZSgnI21haW5TY3JlZW4nKTtcclxuICAgICAgICB0aGlzLmRpc2NsYWltZXIgPSBuZXcgRGlzY2xhaW1lcigpO1xyXG4gICAgICAgIHRoaXMuZWRpdG9yICAgICA9IG5ldyBFZGl0b3IoKTtcclxuICAgICAgICB0aGlzLm1hcnF1ZWUgICAgPSBuZXcgTWFycXVlZSgpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MgICA9IG5ldyBTZXR0aW5ncygpO1xyXG4gICAgICAgIHRoaXMuc3RhdGVQaWNrZXIgPSBuZXcgU3RhdGVQaWNrZXIoKTtcclxuICAgICAgICB0aGlzLnRvb2xiYXIgICAgPSBuZXcgVG9vbGJhcigpO1xyXG4gICAgICAgIHRoaXMucGlja2VycyAgICA9IHt9O1xyXG5cclxuICAgICAgICBbXHJcbiAgICAgICAgICAgIG5ldyBDb2FjaFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgRXhjdXNlUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBJbnRlZ2VyUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBOYW1lZFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgUGhyYXNlc2V0UGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBQbGF0Zm9ybVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgU2VydmljZVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgU3RhdGlvblBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgU3RhdGlvbkxpc3RQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFRpbWVQaWNrZXIoKVxyXG4gICAgICAgIF0uZm9yRWFjaChwaWNrZXIgPT4gdGhpcy5waWNrZXJzW3BpY2tlci54bWxUYWddID0gcGlja2VyKTtcclxuXHJcbiAgICAgICAgLy8gR2xvYmFsIGhvdGtleXNcclxuICAgICAgICBkb2N1bWVudC5ib2R5Lm9ua2V5ZG93biA9IHRoaXMub25JbnB1dC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBBcHBseSBpT1Mtc3BlY2lmaWMgQ1NTIGZpeGVzXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdpb3MnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgcGlja2VyIHRoYXQgaGFuZGxlcyBhIGdpdmVuIHRhZywgaWYgYW55ICovXHJcbiAgICBwdWJsaWMgZ2V0UGlja2VyKHhtbFRhZzogc3RyaW5nKSA6IFBpY2tlclxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBpY2tlcnNbeG1sVGFnXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlIEVTQyB0byBjbG9zZSBwaWNrZXJzIG9yIHNldHRpZ25zICovXHJcbiAgICBwcml2YXRlIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmIChldi5rZXkgIT09ICdFc2NhcGUnKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncy5jbG9zZSgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLyBHbG9iYWwgbWV0aG9kcyBmb3IgYXNzZXJ0aW5nIHRoZSBleGlzdGVuY2Ugb2YgdmFsdWVzLiBUbyBrZWVwIHRoZSBjaGFuY2Ugb2YgZXJyb3JzXHJcbi8vIHdpdGhpbiBhc3NlcnRzIGxvdywgbm8gbG9jYWxpemF0aW9uIGlzIHVzZWQgaGVyZS5cclxuXHJcbi8qKiBBc3NlcnRzIHRoYXQgdGhlIGdpdmVuIHZhbHVlIGV4aXN0czsgbmVpdGhlciB1bmRlZmluZWQgbm9yIG51bGwgKi9cclxuZnVuY3Rpb24gYXNzZXJ0PFQ+KHZhbHVlOiBUKSA6IFRcclxue1xyXG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpXHJcbiAgICAgICAgdGhyb3cgQXNzZXJ0RXJyb3IoJ1ZhbHVlIGRvZXMgbm90IGV4aXN0JywgYXNzZXJ0KTtcclxuXHJcbiAgICByZXR1cm4gdmFsdWU7XHJcbn1cclxuXHJcbi8qKiBBc3NlcnRzIHRoYXQgdGhlIGdpdmVuIHZhbHVlIGV4aXN0cyBhbmQgaXMgYSBudW1iZXIgKi9cclxuZnVuY3Rpb24gYXNzZXJ0TnVtYmVyKHZhbHVlOiBudW1iZXIpIDogdm9pZFxyXG57XHJcbiAgICBpZiAoIHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicgfHwgaXNOYU4odmFsdWUpIClcclxuICAgICAgICB0aHJvdyBBc3NlcnRFcnJvcignVmFsdWUgaXMgbm90IGEgbnVtYmVyJywgYXNzZXJ0TnVtYmVyKTtcclxufVxyXG5cclxuLyoqIENyZWF0ZXMgYW4gYXNzZXJ0aW9uIGVycm9yIHRoYXQgYmVnaW5zIHRoZSBzdGFjayBhdCB0aGUgYXNzZXJ0J3MgY2FsbCBzaXRlICAqL1xyXG5mdW5jdGlvbiBBc3NlcnRFcnJvcihtZXNzYWdlOiBhbnksIGNhbGxlcjogRnVuY3Rpb24pIDogRXJyb3Jcclxue1xyXG4gICAgbGV0IGVycm9yID0gRXJyb3IoYEFzc2VydGlvbiBmYWlsZWQ6ICR7bWVzc2FnZX1gKTtcclxuXHJcbiAgICBpZiAoRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpXHJcbiAgICAgICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UoZXJyb3IsIGNhbGxlcik7XHJcblxyXG4gICAgcmV0dXJuIGVycm9yO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggY29sbGFwc2libGUgZWxlbWVudHMgKi9cclxuY2xhc3MgQ29sbGFwc2libGVzXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzcGFuIFRoZSBlbmNhcHN1bGF0aW5nIGNvbGxhcHNpYmxlIGVsZW1lbnRcclxuICAgICAqIEBwYXJhbSBzdGF0ZSBUcnVlIHRvIGNvbGxhcHNlLCBmYWxzZSB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2V0KHNwYW46IEhUTUxFbGVtZW50LCBzdGF0ZTogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHN0YXRlKSBzcGFuLnNldEF0dHJpYnV0ZSgnY29sbGFwc2VkJywgJycpO1xyXG4gICAgICAgIGVsc2UgICAgICAgc3Bhbi5yZW1vdmVBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3VnYXIgZm9yIGNob29zaW5nIHNlY29uZCB2YWx1ZSBpZiBmaXJzdCBpcyB1bmRlZmluZWQsIGluc3RlYWQgb2YgZmFsc3kgKi9cclxuZnVuY3Rpb24gZWl0aGVyPFQ+KHZhbHVlOiBUIHwgdW5kZWZpbmVkLCB2YWx1ZTI6IFQpIDogVFxyXG57XHJcbiAgICByZXR1cm4gKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpID8gdmFsdWUyIDogdmFsdWU7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCB0aGUgRE9NICovXHJcbmNsYXNzIERPTVxyXG57XHJcbiAgICAvKiogV2hldGhlciB0aGUgd2luZG93IGlzIHRoaW5uZXIgdGhhbiBhIHNwZWNpZmljIHNpemUgKGFuZCwgdGh1cywgaXMgXCJtb2JpbGVcIikgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzTW9iaWxlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGggPD0gNTAwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIFJBRyBhcHBlYXJzIHRvIGJlIHJ1bm5pbmcgb24gYW4gaU9TIGRldmljZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaXNpT1MoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLnBsYXRmb3JtLm1hdGNoKC9pUGhvbmV8aVBvZHxpUGFkL2dpKSAhPT0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gYXR0cmlidXRlIGZyb20gdGhlIGdpdmVuIGVsZW1lbnQsIG9yIHJldHVybnMgdGhlIGdpdmVuXHJcbiAgICAgKiBkZWZhdWx0IHZhbHVlIGlmIHVuc2V0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBhdHRyIE5hbWUgb2YgdGhlIGF0dHJpYnV0ZSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcGFyYW0gZGVmIERlZmF1bHQgdmFsdWUgaWYgYXR0cmlidXRlIGlzbid0IHNldFxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGF0dHJpYnV0ZSdzIHZhbHVlLCBvciBkZWZhdWx0IHZhbHVlIGlmIHVuc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0QXR0cihlbGVtZW50OiBIVE1MRWxlbWVudCwgYXR0cjogc3RyaW5nLCBkZWY6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cilcclxuICAgICAgICAgICAgPyBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSFcclxuICAgICAgICAgICAgOiBkZWY7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyBhbiBlbGVtZW50IGZyb20gdGhlIGdpdmVuIGRvY3VtZW50LCB0aHJvd2luZyBhbiBlcnJvciBpZiBubyBtYXRjaCBpcyBmb3VuZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgQ1NTIHNlbGVjdG9yIHF1ZXJ5IHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHBhcmVudCBQYXJlbnQgb2JqZWN0IHRvIHNlYXJjaDsgZGVmYXVsdHMgdG8gZG9jdW1lbnRcclxuICAgICAqIEByZXR1cm5zIFRoZSBmaXJzdCBlbGVtZW50IHRvIG1hdGNoIHRoZSBnaXZlbiBxdWVyeVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmU8VCBleHRlbmRzIEhUTUxFbGVtZW50PlxyXG4gICAgICAgIChxdWVyeTogc3RyaW5nLCBwYXJlbnQ6IFBhcmVudE5vZGUgPSB3aW5kb3cuZG9jdW1lbnQpIDogVFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBwYXJlbnQucXVlcnlTZWxlY3RvcihxdWVyeSkgYXMgVDtcclxuXHJcbiAgICAgICAgaWYgKCFyZXN1bHQpXHJcbiAgICAgICAgICAgIHRocm93IEFzc2VydEVycm9yKEwuRE9NX01JU1NJTkcocXVlcnkpLCBET00ucmVxdWlyZSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCB0aHJvd2luZyBhbiBlcnJvclxyXG4gICAgICogaWYgdGhlIGF0dHJpYnV0ZSBpcyBtaXNzaW5nLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBhdHRyIE5hbWUgb2YgdGhlIGF0dHJpYnV0ZSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gYXR0cmlidXRlJ3MgdmFsdWVcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlQXR0cihlbGVtZW50OiBIVE1MRWxlbWVudCwgYXR0cjogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICggIWVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpIClcclxuICAgICAgICAgICAgdGhyb3cgQXNzZXJ0RXJyb3IoTC5BVFRSX01JU1NJTkcoYXR0ciksIERPTS5yZXF1aXJlQXR0cik7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGtleSBvZiB0aGUgZ2l2ZW4gZWxlbWVudCdzIGRhdGFzZXQsIHRocm93aW5nIGFuIGVycm9yXHJcbiAgICAgKiBpZiB0aGUgdmFsdWUgaXMgbWlzc2luZyBvciBlbXB0eS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgZGF0YSBvZlxyXG4gICAgICogQHBhcmFtIGtleSBLZXkgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGRhdGFzZXQncyB2YWx1ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmVEYXRhKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBrZXk6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgdmFsdWUgPSBlbGVtZW50LmRhdGFzZXRba2V5XTtcclxuXHJcbiAgICAgICAgaWYgKCBTdHJpbmdzLmlzTnVsbE9yRW1wdHkodmFsdWUpIClcclxuICAgICAgICAgICAgdGhyb3cgQXNzZXJ0RXJyb3IoTC5EQVRBX01JU1NJTkcoa2V5KSwgRE9NLnJlcXVpcmVEYXRhKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHZhbHVlITtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJsdXJzICh1bmZvY3VzZXMpIHRoZSBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwYXJlbnQgSWYgZ2l2ZW4sIG9ubHkgYmx1cnMgaWYgYWN0aXZlIGlzIGRlc2NlbmRhbnRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBibHVyQWN0aXZlKHBhcmVudDogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5ib2R5KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgYWN0aXZlID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCBhY3RpdmUgJiYgYWN0aXZlLmJsdXIgJiYgcGFyZW50LmNvbnRhaW5zKGFjdGl2ZSkgKVxyXG4gICAgICAgICAgICBhY3RpdmUuYmx1cigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRGVlcCBjbG9uZXMgYWxsIHRoZSBjaGlsZHJlbiBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgaW50byB0aGUgdGFyZ2V0IGVsZW1lbnQuXHJcbiAgICAgKiBVc2luZyBpbm5lckhUTUwgd291bGQgYmUgZWFzaWVyLCBob3dldmVyIGl0IGhhbmRsZXMgc2VsZi1jbG9zaW5nIHRhZ3MgcG9vcmx5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzb3VyY2UgRWxlbWVudCB3aG9zZSBjaGlsZHJlbiB0byBjbG9uZVxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFbGVtZW50IHRvIGFwcGVuZCB0aGUgY2xvbmVkIGNoaWxkcmVuIHRvXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xvbmVJbnRvKHNvdXJjZTogSFRNTEVsZW1lbnQsIHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc291cmNlLmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHRhcmdldC5hcHBlbmRDaGlsZCggc291cmNlLmNoaWxkTm9kZXNbaV0uY2xvbmVOb2RlKHRydWUpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdWdhciBmb3IgY3JlYXRpbmcgYW5kIGFkZGluZyBhbiBvcHRpb24gZWxlbWVudCB0byBhIHNlbGVjdCBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzZWxlY3QgU2VsZWN0IGxpc3QgZWxlbWVudCB0byBhZGQgdGhlIG9wdGlvbiB0b1xyXG4gICAgICogQHBhcmFtIHRleHQgTGFiZWwgZm9yIHRoZSBvcHRpb25cclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSBmb3IgdGhlIG9wdGlvblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFkZE9wdGlvbihzZWxlY3Q6IEhUTUxTZWxlY3RFbGVtZW50LCB0ZXh0OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgPSAnJylcclxuICAgICAgICA6IEhUTUxPcHRpb25FbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpIGFzIEhUTUxPcHRpb25FbGVtZW50O1xyXG5cclxuICAgICAgICBvcHRpb24udGV4dCAgPSB0ZXh0O1xyXG4gICAgICAgIG9wdGlvbi52YWx1ZSA9IHZhbHVlO1xyXG5cclxuICAgICAgICBzZWxlY3QuYWRkKG9wdGlvbik7XHJcbiAgICAgICAgcmV0dXJuIG9wdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1Z2FyIGZvciBwb3B1bGF0aW5nIGEgc2VsZWN0IGVsZW1lbnQgd2l0aCBpdGVtcyBmcm9tIGEgZ2l2ZW4gb2JqZWN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBsaXN0IFNlbGVjdCBlbGVtZW50IHRvIHBvcHVsYXRlXHJcbiAgICAgKiBAcGFyYW0gaXRlbXMgQSBkaWN0aW9uYXJ5IHdoZXJlIGtleXMgYWN0IGxpa2UgdmFsdWVzLCBhbmQgdmFsdWVzIGxpa2UgbGFiZWxzXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0ZWQgSWYgbWF0Y2hlcyBhIGRpY3Rpb25hcnkga2V5LCB0aGF0IGtleSBpcyB0aGUgcHJlLXNlbGVjdGVkIG9wdGlvblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBvcHVsYXRlKGxpc3Q6IEhUTUxTZWxlY3RFbGVtZW50LCBpdGVtczogYW55LCBzZWxlY3RlZD86IGFueSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgdmFsdWUgaW4gaXRlbXMpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFiZWwgPSBpdGVtc1t2YWx1ZV07XHJcbiAgICAgICAgICAgIGxldCBvcHQgICA9IERPTS5hZGRPcHRpb24obGlzdCwgbGFiZWwsIHZhbHVlKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChzZWxlY3RlZCAhPT0gdW5kZWZpbmVkICYmIHZhbHVlID09PSBzZWxlY3RlZClcclxuICAgICAgICAgICAgICAgIG9wdC5zZWxlY3RlZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBnaXZlbiBlbGVtZW50LCBleGNsdWRpbmcgdGhlIHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuLlxyXG4gICAgICogQmUgd2FybmVkOyB0aGlzIG1ldGhvZCB1c2VzIFJBRy1zcGVjaWZpYyBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE5OTg2MzI4XHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHJlY3Vyc2l2ZWx5IGdldCB0ZXh0IGNvbnRlbnQgb2ZcclxuICAgICAqIEByZXR1cm5zIFRleHQgY29udGVudCBvZiBnaXZlbiBlbGVtZW50LCB3aXRob3V0IHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0VmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAgICAgIChlbGVtZW50Lm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQgfHwgJyc7XHJcbiAgICAgICAgZWxzZSBpZiAoIGVsZW1lbnQudGFnTmFtZSA9PT0gJ0JVVFRPTicgKVxyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcblxyXG4gICAgICAgIC8vIFJldHVybiBibGFuayAoc2tpcCkgaWYgY2hpbGQgb2YgYSBjb2xsYXBzZWQgZWxlbWVudC4gUHJldmlvdXNseSwgdGhpcyB1c2VkXHJcbiAgICAgICAgLy8gZ2V0Q29tcHV0ZWRTdHlsZSwgYnV0IHRoYXQgZG9lc24ndCB3b3JrIGlmIHRoZSBlbGVtZW50IGlzIHBhcnQgb2YgYW4gb3JwaGFuZWRcclxuICAgICAgICAvLyBwaHJhc2UgKGFzIGhhcHBlbnMgd2l0aCB0aGUgcGhyYXNlc2V0IHBpY2tlcikuXHJcbiAgICAgICAgbGV0IHBhcmVudCA9IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCBwYXJlbnQgJiYgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJykgKVxyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcblxyXG4gICAgICAgIGxldCB0ZXh0ID0gJyc7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50LmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHRleHQgKz0gRE9NLmdldFZpc2libGVUZXh0KGVsZW1lbnQuY2hpbGROb2Rlc1tpXSBhcyBFbGVtZW50KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4sXHJcbiAgICAgKiBhbmQgZXhjZXNzIHdoaXRlc3BhY2UgYXMgYSByZXN1bHQgb2YgY29udmVydGluZyBmcm9tIEhUTUwvWE1MLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE5OTg2MzI4XHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHJlY3Vyc2l2ZWx5IGdldCB0ZXh0IGNvbnRlbnQgb2ZcclxuICAgICAqIEByZXR1cm5zIENsZWFuZWQgdGV4dCBvZiBnaXZlbiBlbGVtZW50LCB3aXRob3V0IHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0Q2xlYW5lZFZpc2libGVUZXh0KGVsZW1lbnQ6IEVsZW1lbnQpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFN0cmluZ3MuY2xlYW4oIERPTS5nZXRWaXNpYmxlVGV4dChlbGVtZW50KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2NhbnMgZm9yIHRoZSBuZXh0IGZvY3VzYWJsZSBzaWJsaW5nIGZyb20gYSBnaXZlbiBlbGVtZW50LCBza2lwcGluZyBoaWRkZW4gb3JcclxuICAgICAqIHVuZm9jdXNhYmxlIGVsZW1lbnRzLiBJZiB0aGUgZW5kIG9mIHRoZSBjb250YWluZXIgaXMgaGl0LCB0aGUgc2NhbiB3cmFwcyBhcm91bmQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGZyb20gRWxlbWVudCB0byBzdGFydCBzY2FubmluZyBmcm9tXHJcbiAgICAgKiBAcGFyYW0gZGlyIERpcmVjdGlvbjsgLTEgZm9yIGxlZnQgKHByZXZpb3VzKSwgMSBmb3IgcmlnaHQgKG5leHQpXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbmV4dCBhdmFpbGFibGUgc2libGluZywgb3IgbnVsbCBpZiBub25lIGZvdW5kXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZnJvbTogSFRNTEVsZW1lbnQsIGRpcjogbnVtYmVyKVxyXG4gICAgICAgIDogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGRpciA9PT0gMClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuQkFEX0RJUkVDVElPTihkaXIpICk7XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50ID0gZnJvbTtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZyb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCFwYXJlbnQpXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICB3aGlsZSAodHJ1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFByb2NlZWQgdG8gbmV4dCBlbGVtZW50LCBvciB3cmFwIGFyb3VuZCBpZiBoaXQgdGhlIGVuZCBvZiBwYXJlbnRcclxuICAgICAgICAgICAgaWYgICAgICAoZGlyIDwgMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID4gMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHBhcmVudC5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGNvbWUgYmFjayB0byB0aGUgc3RhcnRpbmcgZWxlbWVudCwgbm90aGluZyB3YXMgZm91bmRcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09IGZyb20pXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMgZWxlbWVudCBpc24ndCBoaWRkZW4gYW5kIGlzIGZvY3VzYWJsZSwgcmV0dXJuIGl0IVxyXG4gICAgICAgICAgICBpZiAoICFjdXJyZW50LmhpZGRlbiApXHJcbiAgICAgICAgICAgIGlmICggY3VycmVudC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4JykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBlbGVtZW50LCByZWxldmFudCB0byBpdHMgcGFyZW50LlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIGVsZW1lbnQgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluZGV4T2YoY2hpbGQ6IEhUTUxFbGVtZW50KSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBub2RlLCByZWxldmFudCB0byBpdHMgcGFyZW50LiBVc2VkIGZvciB0ZXh0IG5vZGVzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIG5vZGUgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5vZGVJbmRleE9mKGNoaWxkOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGROb2RlcywgY2hpbGQpXHJcbiAgICAgICAgICAgIDogLTE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBhbmQgYWxsIGl0cyBsYWJlbHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byB0b2dnbGUgdGhlIGhpZGRlbiBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBmb3JjZSBPcHRpb25hbCB2YWx1ZSB0byBmb3JjZSB0b2dnbGluZyB0b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRvZ2dsZUhpZGRlbihlbGVtZW50OiBIVE1MRWxlbWVudCwgZm9yY2U/OiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaGlkZGVuID0gIWVsZW1lbnQuaGlkZGVuO1xyXG5cclxuICAgICAgICAvLyBEbyBub3RoaW5nIGlmIGFscmVhZHkgdG9nZ2xlZCB0byB0aGUgZm9yY2VkIHN0YXRlXHJcbiAgICAgICAgaWYgKGhpZGRlbiA9PT0gZm9yY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgZWxlbWVudC5oaWRkZW4gPSBoaWRkZW47XHJcblxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtmb3I9JyR7ZWxlbWVudC5pZH0nXWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGwgPT4gKGwgYXMgSFRNTEVsZW1lbnQpLmhpZGRlbiA9IGhpZGRlbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mIGEgZ3JvdXAgb2YgZWxlbWVudHMsIGluIGJ1bGsuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGxpc3QgQW4gYXJyYXkgb2YgYXJndW1lbnQgcGFpcnMgZm9yIHt0b2dnbGVIaWRkZW59XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdG9nZ2xlSGlkZGVuQWxsKC4uLmxpc3Q6IFtIVE1MRWxlbWVudCwgYm9vbGVhbj9dW10pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxpc3QuZm9yRWFjaCggbCA9PiB0aGlzLnRvZ2dsZUhpZGRlbiguLi5sKSApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQSB2ZXJ5IHNtYWxsIHN1YnNldCBvZiBNYXJrZG93biBmb3IgaHlwZXJsaW5raW5nIGEgYmxvY2sgb2YgdGV4dCAqL1xyXG5jbGFzcyBMaW5rZG93blxyXG57XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGlua2VkIHRleHQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX0xJTksgPSAvXFxbKFtcXHNcXFNdKz8pXFxdXFxbKFxcZCspXFxdL2dtaTtcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rIHJlZmVyZW5jZXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX1JFRiAgPSAvXlxcWyhcXGQrKVxcXTpcXHMrKFxcUyspJC9nbWk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRlbXB0cyB0byBsb2FkIHRoZSBnaXZlbiBsaW5rZG93biBmaWxlLCBwYXJzZSBhbmQgc2V0IGl0IGFzIGFuIGVsZW1lbnQncyB0ZXh0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwYXRoIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCB0byBmZXRjaCB0aGUgbGlua2Rvd24gZnJvbVxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IERPTSBxdWVyeSBmb3IgdGhlIG9iamVjdCB0byBwdXQgdGhlIHRleHQgaW50b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWRJbnRvKHBhdGg6IHN0cmluZywgcXVlcnk6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGRvbSA9IERPTS5yZXF1aXJlKHF1ZXJ5KTtcclxuXHJcbiAgICAgICAgZG9tLmlubmVyVGV4dCA9IGBMb2FkaW5nIHRleHQgZnJvbSAnJHtwYXRofScuLi5gO1xyXG5cclxuICAgICAgICBmZXRjaChwYXRoKVxyXG4gICAgICAgICAgICAudGhlbiggcmVxID0+IHJlcS50ZXh0KCkgKVxyXG4gICAgICAgICAgICAudGhlbiggdHh0ID0+IGRvbS5pbm5lckhUTUwgPSBMaW5rZG93bi5wYXJzZSh0eHQpIClcclxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiBkb20uaW5uZXJUZXh0ID0gYENvdWxkIG5vdCBsb2FkICcke3BhdGh9JzogJHtlcnJ9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQYXJzZXMgdGhlIGdpdmVuIHRleHQgZnJvbSBMaW5rZG93biB0byBIVE1MLCBjb252ZXJ0aW5nIHRhZ2dlZCB0ZXh0IGludG8gbGlua3NcclxuICAgICAqIHVzaW5nIGEgZ2l2ZW4gbGlzdCBvZiByZWZlcmVuY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0ZXh0IExpbmtkb3duIHRleHQgdG8gdHJhbnNmb3JtIHRvIEhUTUxcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcGFyc2UodGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBsaW5rcyA6IERpY3Rpb25hcnk8c3RyaW5nPiA9IHt9O1xyXG5cclxuICAgICAgICAvLyBGaXJzdCwgc2FuaXRpemUgYW55IEhUTUxcclxuICAgICAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKCc8JywgJyZsdDsnKS5yZXBsYWNlKCc+JywgJyZndDsnKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZ2V0IHRoZSBsaXN0IG9mIHJlZmVyZW5jZXMsIHJlbW92aW5nIHRoZW0gZnJvbSB0aGUgdGV4dFxyXG4gICAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9SRUYsIChfLCBrLCB2KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGlua3Nba10gPSB2O1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmFsbHksIHJlcGxhY2UgZWFjaCB0YWdnZWQgcGFydCBvZiB0ZXh0IHdpdGggYSBsaW5rIGVsZW1lbnQuIElmIGEgdGFnIGhhc1xyXG4gICAgICAgIC8vIGFuIGludmFsaWQgcmVmZXJlbmNlLCBpdCBpcyBpZ25vcmVkLlxyXG4gICAgICAgIHJldHVybiB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9MSU5LLCAobWF0Y2gsIHQsIGspID0+XHJcbiAgICAgICAgICAgIGxpbmtzW2tdXHJcbiAgICAgICAgICAgICAgICA/IGA8YSBocmVmPScke2xpbmtzW2tdfScgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXJcIj4ke3R9PC9hPmBcclxuICAgICAgICAgICAgICAgIDogbWF0Y2hcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBwYXJzaW5nIGRhdGEgZnJvbSBzdHJpbmdzICovXHJcbmNsYXNzIFBhcnNlXHJcbntcclxuICAgIC8qKiBQYXJzZXMgYSBnaXZlbiBzdHJpbmcgaW50byBhIGJvb2xlYW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vbGVhbihzdHI6IHN0cmluZykgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgc3RyID0gc3RyLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGlmIChzdHIgPT09ICd0cnVlJyAgfHwgc3RyID09PSAnMScpXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIGlmIChzdHIgPT09ICdmYWxzZScgfHwgc3RyID09PSAnMCcpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhyb3cgRXJyb3IoIEwuQkFEX0JPT0xFQU4oc3RyKSApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBnZW5lcmF0aW5nIHJhbmRvbSBkYXRhICovXHJcbmNsYXNzIFJhbmRvbVxyXG57XHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIGEgcmFuZG9tIGludGVnZXIgZnJvbSB0aGUgZ2l2ZW4gcmFuZ2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIG1pbiBNaW5pbXVtIGludGVnZXIgdG8gcGljaywgaW5jbHVzaXZlXHJcbiAgICAgKiBAcGFyYW0gbWF4IE1heGltdW0gaW50ZWdlciB0byBwaWNrLCBpbmNsdXNpdmVcclxuICAgICAqIEByZXR1cm5zIFJhbmRvbSBpbnRlZ2VyIHdpdGhpbiB0aGUgZ2l2ZW4gcmFuZ2VcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbnQobWluOiBudW1iZXIgPSAwLCBtYXg6IG51bWJlciA9IDEpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIE1hdGgucm91bmQoIE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluKSApICsgbWluO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBlbGVtZW50IGZyb20gYSBnaXZlbiBhcnJheS1saWtlIG9iamVjdCB3aXRoIGEgbGVuZ3RoIHByb3BlcnR5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFycmF5KGFycjogTGVuZ3RoYWJsZSkgOiBhbnlcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gYXJyWyBSYW5kb20uaW50KDAsIGFyci5sZW5ndGggLSAxKSBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTcGxpY2VzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFycmF5U3BsaWNlPFQ+KGFycjogVFtdKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gYXJyLnNwbGljZShSYW5kb20uaW50KDAsIGFyci5sZW5ndGggLSAxKSwgMSlbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGtleSBmcm9tIGEgZ2l2ZW4gb2JqZWN0ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG9iamVjdEtleShvYmo6IHt9KSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkoIE9iamVjdC5rZXlzKG9iaikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIHRydWUgb3IgZmFsc2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2Ugb3V0IG9mIDEwMCwgdG8gcGljayBgdHJ1ZWBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sKGNoYW5jZTogbnVtYmVyID0gNTApIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uaW50KDAsIDEwMCkgPCBjaGFuY2U7XHJcbiAgICB9XHJcbn1cclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBjbGFzcyBmb3IgYXVkaW8gZnVuY3Rpb25hbGl0eSAqL1xyXG5jbGFzcyBTb3VuZHNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBEZWNvZGVzIHRoZSBnaXZlbiBhdWRpbyBmaWxlIGludG8gcmF3IGF1ZGlvIGRhdGEuIFRoaXMgaXMgYSB3cmFwcGVyIGZvciB0aGUgb2xkZXJcclxuICAgICAqIGNhbGxiYWNrLWJhc2VkIHN5bnRheCwgc2luY2UgaXQgaXMgdGhlIG9ubHkgb25lIGlPUyBjdXJyZW50bHkgc3VwcG9ydHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nXHJcbiAgICAgKiBAcGFyYW0gYnVmZmVyIEJ1ZmZlciBvZiBlbmNvZGVkIGZpbGUgZGF0YSAoZS5nLiBtcDMpIHRvIGRlY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFzeW5jIGRlY29kZShjb250ZXh0OiBBdWRpb0NvbnRleHQsIGJ1ZmZlcjogQXJyYXlCdWZmZXIpXHJcbiAgICAgICAgOiBQcm9taXNlPEF1ZGlvQnVmZmVyPlxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSA8QXVkaW9CdWZmZXI+ICggKHJlc29sdmUsIHJlamVjdCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBjb250ZXh0LmRlY29kZUF1ZGlvRGF0YShidWZmZXIsIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBzdHJpbmdzICovXHJcbmNsYXNzIFN0cmluZ3Ncclxue1xyXG4gICAgLyoqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gc3RyaW5nIGlzIG51bGwsIG9yIGVtcHR5ICh3aGl0ZXNwYWNlIG9ubHkgb3IgemVyby1sZW5ndGgpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzTnVsbE9yRW1wdHkoc3RyOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gIXN0ciB8fCAhc3RyLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludCdzIGEgZ2l2ZW4gbGlzdCBvZiBzdGF0aW9ucywgd2l0aCBjb250ZXh0IHNlbnNpdGl2ZSBleHRyYXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGVzIExpc3Qgb2Ygc3RhdGlvbiBjb2RlcyB0byBqb2luXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBMaXN0J3MgY29udGV4dC4gSWYgJ2NhbGxpbmcnLCBoYW5kbGVzIHNwZWNpYWwgY2FzZVxyXG4gICAgICogQHJldHVybnMgUHJldHR5LXByaW50ZWQgbGlzdCBvZiBnaXZlbiBzdGF0aW9uc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21TdGF0aW9uTGlzdChjb2Rlczogc3RyaW5nW10sIGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gJyc7XHJcbiAgICAgICAgbGV0IG5hbWVzICA9IGNvZGVzLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIG5hbWVzLmZvckVhY2goIChjLCBpKSA9PiBuYW1lc1tpXSA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGMpICk7XHJcblxyXG4gICAgICAgIGlmIChuYW1lcy5sZW5ndGggPT09IDEpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IChjb250ZXh0ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgICAgICA/IGAke25hbWVzWzBdfSBvbmx5YFxyXG4gICAgICAgICAgICAgICAgOiBuYW1lc1swXTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFzdFN0YXRpb24gPSBuYW1lcy5wb3AoKTtcclxuXHJcbiAgICAgICAgICAgIHJlc3VsdCAgPSBuYW1lcy5qb2luKCcsICcpO1xyXG4gICAgICAgICAgICByZXN1bHQgKz0gYCBhbmQgJHtsYXN0U3RhdGlvbn1gO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludHMgdGhlIGdpdmVuIGRhdGUgb3IgaG91cnMgYW5kIG1pbnV0ZXMgaW50byBhIDI0LWhvdXIgdGltZSAoZS5nLiAwMTowOSkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGhvdXJzIEhvdXJzLCBmcm9tIDAgdG8gMjMsIG9yIERhdGUgb2JqZWN0XHJcbiAgICAgKiBAcGFyYW0gbWludXRlcyBNaW51dGVzLCBmcm9tIDAgdG8gNTlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tVGltZShob3VyczogbnVtYmVyIHwgRGF0ZSwgbWludXRlczogbnVtYmVyID0gMCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoaG91cnMgaW5zdGFuY2VvZiBEYXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWludXRlcyA9IGhvdXJzLmdldE1pbnV0ZXMoKTtcclxuICAgICAgICAgICAgaG91cnMgICA9IGhvdXJzLmdldEhvdXJzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gaG91cnMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpICsgJzonICtcclxuICAgICAgICAgICAgbWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFucyB1cCB0aGUgZ2l2ZW4gdGV4dCBvZiBleGNlc3Mgd2hpdGVzcGFjZSBhbmQgYW55IG5ld2xpbmVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsZWFuKHRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGV4dC50cmltKClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXG5cXHJdL2dpLCAgICcnICApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHN7Mix9L2dpLCAgICcgJyApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC/igJxcXHMrL2dpLCAgICAgJ+KAnCcgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzK+KAnS9naSwgICAgICfigJ0nIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyhbLixdKS9naSwgJyQxJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0cm9uZ2x5IGNvbXByZXNzZXMgdGhlIGdpdmVuIHN0cmluZyB0byBvbmUgbW9yZSBmaWxlbmFtZSBmcmllbmRseSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWxlbmFtZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgLy8gUmVwbGFjZSBwbHVyYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pZXNcXGIvZywgJ3knKVxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgY29tbW9uIHdvcmRzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGIoYXxhbnxhdHxiZXxvZnxvbnx0aGV8dG98aW58aXN8aGFzfGJ5fHdpdGgpXFxiL2csICcnKVxyXG4gICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgIC8vIENvbnZlcnQgc3BhY2VzIHRvIHVuZGVyc2NvcmVzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrL2csICdfJylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFsbCBub24tYWxwaGFudW1lcmljYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXmEtejAtOV9dL2csICcnKVxyXG4gICAgICAgICAgICAvLyBMaW1pdCB0byAxMDAgY2hhcnM7IG1vc3Qgc3lzdGVtcyBzdXBwb3J0IG1heC4gMjU1IGJ5dGVzIGluIGZpbGVuYW1lc1xyXG4gICAgICAgICAgICAuc3Vic3RyaW5nKDAsIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGZpcnN0IG1hdGNoIG9mIGEgcGF0dGVybiBpbiBhIHN0cmluZywgb3IgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaXJzdE1hdGNoKHRleHQ6IHN0cmluZywgcGF0dGVybjogUmVnRXhwLCBpZHg6IG51bWJlcilcclxuICAgICAgICA6IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBtYXRjaCA9IHRleHQubWF0Y2gocGF0dGVybik7XHJcblxyXG4gICAgICAgIHJldHVybiAobWF0Y2ggJiYgbWF0Y2hbaWR4XSlcclxuICAgICAgICAgICAgPyBtYXRjaFtpZHhdXHJcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgc3RhdGlvbiBuYW1lLCB3aGljaCBjYW4gYmUgYSBzaW1wbGUgc3RyaW5nIG9yIGNvbXBsZXggb2JqZWN0ICovXHJcbnR5cGUgU3RhdGlvbiA9IHN0cmluZyB8IFN0YXRpb25EZWY7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIGNvbXBsZXggc3RhdGlvbiBuYW1lIGRlZmluaXRpb24gKi9cclxuaW50ZXJmYWNlIFN0YXRpb25EZWZcclxue1xyXG4gICAgLyoqIENhbm9uaWNhbCBuYW1lIG9mIHRoZSBzdGF0aW9uICovXHJcbiAgICBuYW1lICAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogU3RhdGlvbiBjb2RlIHRvIHVzZSB0aGUgc2FtZSByZWNvcmRpbmcgb2YgKi9cclxuICAgIHZveEFsaWFzPyA6IHN0cmluZztcclxufVxyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBnZW5lcmljIGtleS12YWx1ZSBkaWN0aW9uYXJ5LCB3aXRoIHN0cmluZyBrZXlzICovXHJcbnR5cGUgRGljdGlvbmFyeTxUPiA9IHsgW2luZGV4OiBzdHJpbmddOiBUIH07XHJcblxyXG4vKiogRGVmaW5lcyB0aGUgZGF0YSByZWZlcmVuY2VzIGNvbmZpZyBvYmplY3QgcGFzc2VkIGludG8gUkFHLm1haW4gb24gaW5pdCAqL1xyXG5pbnRlcmZhY2UgRGF0YVJlZnNcclxue1xyXG4gICAgLyoqIFNlbGVjdG9yIGZvciBnZXR0aW5nIHRoZSBwaHJhc2Ugc2V0IFhNTCBJRnJhbWUgZWxlbWVudCAqL1xyXG4gICAgcGhyYXNlc2V0RW1iZWQgOiBzdHJpbmc7XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIGV4Y3VzZXMgZm9yIHRyYWluIGRlbGF5cyBvciBjYW5jZWxsYXRpb25zIHRvIHVzZSAqL1xyXG4gICAgZXhjdXNlc0RhdGEgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNwZWNpYWwgdHJhaW5zIHRvIHVzZSAqL1xyXG4gICAgbmFtZWREYXRhICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNlcnZpY2VzL25ldHdvcmtzIHRvIHVzZSAqL1xyXG4gICAgc2VydmljZXNEYXRhICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgZGljdGlvbmFyeSBvZiBzdGF0aW9uIGNvZGVzIGFuZCBuYW1lcyB0byB1c2UgKi9cclxuICAgIHN0YXRpb25zRGF0YSAgIDogRGljdGlvbmFyeTxzdHJpbmc+O1xyXG59XHJcblxyXG4vKiogRmlsbCBpbnMgZm9yIHZhcmlvdXMgbWlzc2luZyBkZWZpbml0aW9ucyBvZiBtb2Rlcm4gSmF2YXNjcmlwdCBmZWF0dXJlcyAqL1xyXG5cclxuaW50ZXJmYWNlIFdpbmRvd1xyXG57XHJcbiAgICBvbnVuaGFuZGxlZHJlamVjdGlvbjogRXJyb3JFdmVudEhhbmRsZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBcnJheTxUPlxyXG57XHJcbiAgICBpbmNsdWRlcyhzZWFyY2hFbGVtZW50OiBULCBmcm9tSW5kZXg/OiBudW1iZXIpIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEVycm9yQ29uc3RydWN0b3Jcclxue1xyXG4gICAgY2FwdHVyZVN0YWNrVHJhY2UodGFyZ2V0OiBhbnksIGN0b3I/OiBGdW5jdGlvbikgOiB2b2lkO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSFRNTEVsZW1lbnRcclxue1xyXG4gICAgbGFiZWxzIDogTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XHJcbn1cclxuXHJcbmludGVyZmFjZSBTdHJpbmdcclxue1xyXG4gICAgcGFkU3RhcnQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbiAgICBwYWRFbmQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBdWRpb0NvbnRleHRCYXNlXHJcbntcclxuICAgIGF1ZGlvV29ya2xldCA6IEF1ZGlvV29ya2xldDtcclxufVxyXG5cclxudHlwZSBTYW1wbGVDaGFubmVscyA9IEZsb2F0MzJBcnJheVtdW107XHJcblxyXG5kZWNsYXJlIGNsYXNzIEF1ZGlvV29ya2xldFByb2Nlc3NvclxyXG57XHJcbiAgICBzdGF0aWMgcGFyYW1ldGVyRGVzY3JpcHRvcnMgOiBBdWRpb1BhcmFtRGVzY3JpcHRvcltdO1xyXG5cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3RvcihvcHRpb25zPzogQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMpO1xyXG4gICAgcmVhZG9ubHkgcG9ydD86IE1lc3NhZ2VQb3J0O1xyXG5cclxuICAgIHByb2Nlc3MoXHJcbiAgICAgICAgaW5wdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBvdXRwdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBwYXJhbWV0ZXJzOiBEaWN0aW9uYXJ5PEZsb2F0MzJBcnJheT5cclxuICAgICkgOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMgZXh0ZW5kcyBBdWRpb05vZGVPcHRpb25zXHJcbntcclxuICAgIG51bWJlck9mSW5wdXRzPyA6IG51bWJlcjtcclxuICAgIG51bWJlck9mT3V0cHV0cz8gOiBudW1iZXI7XHJcbiAgICBvdXRwdXRDaGFubmVsQ291bnQ/IDogbnVtYmVyW107XHJcbiAgICBwYXJhbWV0ZXJEYXRhPyA6IHtbaW5kZXg6IHN0cmluZ10gOiBudW1iZXJ9O1xyXG4gICAgcHJvY2Vzc29yT3B0aW9ucz8gOiBhbnk7XHJcbn1cclxuXHJcbmludGVyZmFjZSBNZWRpYVRyYWNrQ29uc3RyYWludFNldFxyXG57XHJcbiAgICBhdXRvR2FpbkNvbnRyb2w/OiBib29sZWFuIHwgQ29uc3RyYWluQm9vbGVhblBhcmFtZXRlcnM7XHJcbiAgICBub2lzZVN1cHByZXNzaW9uPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG59XHJcblxyXG5kZWNsYXJlIGZ1bmN0aW9uIHJlZ2lzdGVyUHJvY2Vzc29yKG5hbWU6IHN0cmluZywgY3RvcjogQXVkaW9Xb3JrbGV0UHJvY2Vzc29yKSA6IHZvaWQ7IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBkYXRhIGZvciBleGN1c2VzLCB0cmFpbnMsIHNlcnZpY2VzIGFuZCBzdGF0aW9ucyAqL1xyXG5jbGFzcyBEYXRhYmFzZVxyXG57XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZXhjdXNlcyAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIG5hbWVkIHRyYWlucyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBuYW1lZCAgICAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2Ygc2VydmljZSBvciBuZXR3b3JrIG5hbWVzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHNlcnZpY2VzICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGljdGlvbmFyeSBvZiBzdGF0aW9uIG5hbWVzLCB3aXRoIHRocmVlLWxldHRlciBjb2RlIGtleXMgKGUuZy4gQUJDKSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzdGF0aW9ucyAgICAgIDogRGljdGlvbmFyeTxTdGF0aW9uPjtcclxuICAgIC8qKiBMb2FkZWQgWE1MIGRvY3VtZW50IGNvbnRhaW5pbmcgcGhyYXNlc2V0IGRhdGEgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgcGhyYXNlc2V0cyAgICA6IERvY3VtZW50O1xyXG4gICAgLyoqIEFtb3VudCBvZiBzdGF0aW9ucyBpbiB0aGUgY3VycmVudGx5IGxvYWRlZCBkYXRhc2V0ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHN0YXRpb25zQ291bnQgOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGRhdGFSZWZzOiBEYXRhUmVmcylcclxuICAgIHtcclxuICAgICAgICBsZXQgcXVlcnkgID0gZGF0YVJlZnMucGhyYXNlc2V0RW1iZWQ7XHJcbiAgICAgICAgbGV0IGlmcmFtZSA9IERPTS5yZXF1aXJlIDxIVE1MSUZyYW1lRWxlbWVudD4gKHF1ZXJ5KTtcclxuXHJcbiAgICAgICAgaWYgKCFpZnJhbWUuY29udGVudERvY3VtZW50KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FKHF1ZXJ5KSApO1xyXG5cclxuICAgICAgICB0aGlzLnBocmFzZXNldHMgICAgPSBpZnJhbWUuY29udGVudERvY3VtZW50O1xyXG4gICAgICAgIHRoaXMuZXhjdXNlcyAgICAgICA9IGRhdGFSZWZzLmV4Y3VzZXNEYXRhO1xyXG4gICAgICAgIHRoaXMubmFtZWQgICAgICAgICA9IGRhdGFSZWZzLm5hbWVkRGF0YTtcclxuICAgICAgICB0aGlzLnNlcnZpY2VzICAgICAgPSBkYXRhUmVmcy5zZXJ2aWNlc0RhdGE7XHJcbiAgICAgICAgdGhpcy5zdGF0aW9ucyAgICAgID0gZGF0YVJlZnMuc3RhdGlvbnNEYXRhO1xyXG4gICAgICAgIHRoaXMuc3RhdGlvbnNDb3VudCA9IE9iamVjdC5rZXlzKHRoaXMuc3RhdGlvbnMpLmxlbmd0aDtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tEYXRhYmFzZV0gRW50cmllcyBsb2FkZWQ6Jyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdEV4Y3VzZXM6JywgICAgICB0aGlzLmV4Y3VzZXMubGVuZ3RoKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0TmFtZWQgdHJhaW5zOicsIHRoaXMubmFtZWQubGVuZ3RoKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0U2VydmljZXM6JywgICAgIHRoaXMuc2VydmljZXMubGVuZ3RoKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0U3RhdGlvbnM6JywgICAgIHRoaXMuc3RhdGlvbnNDb3VudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGV4Y3VzZSBmb3IgYSBkZWxheSBvciBjYW5jZWxsYXRpb24gKi9cclxuICAgIHB1YmxpYyBwaWNrRXhjdXNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMuZXhjdXNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgcGlja05hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMubmFtZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xvbmVzIGFuZCBnZXRzIHBocmFzZSB3aXRoIHRoZSBnaXZlbiBJRCwgb3IgbnVsbCBpZiBpdCBkb2Vzbid0IGV4aXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZCBJRCBvZiB0aGUgcGhyYXNlIHRvIGdldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlKGlkOiBzdHJpbmcpIDogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IHRoaXMucGhyYXNlc2V0cy5xdWVyeVNlbGVjdG9yKCdwaHJhc2UjJyArIGlkKSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKHJlc3VsdClcclxuICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBwaHJhc2VzZXQgd2l0aCB0aGUgZ2l2ZW4gSUQsIG9yIG51bGwgaWYgaXQgZG9lc24ndCBleGlzdC4gTm90ZSB0aGF0IHRoZVxyXG4gICAgICogcmV0dXJuZWQgcGhyYXNlc2V0IGNvbWVzIGZyb20gdGhlIFhNTCBkb2N1bWVudCwgc28gaXQgc2hvdWxkIG5vdCBiZSBtdXRhdGVkLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZCBJRCBvZiB0aGUgcGhyYXNlc2V0IHRvIGdldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlc2V0KGlkOiBzdHJpbmcpIDogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucGhyYXNlc2V0cy5xdWVyeVNlbGVjdG9yKCdwaHJhc2VzZXQjJyArIGlkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gcmFpbCBuZXR3b3JrIG5hbWUgKi9cclxuICAgIHB1YmxpYyBwaWNrU2VydmljZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLnNlcnZpY2VzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIGEgcmFuZG9tIHN0YXRpb24gY29kZSBmcm9tIHRoZSBkYXRhc2V0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBleGNsdWRlIExpc3Qgb2YgY29kZXMgdG8gZXhjbHVkZS4gTWF5IGJlIGlnbm9yZWQgaWYgc2VhcmNoIHRha2VzIHRvbyBsb25nLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlKGV4Y2x1ZGU/OiBzdHJpbmdbXSkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICAvLyBHaXZlIHVwIGZpbmRpbmcgcmFuZG9tIHN0YXRpb24gdGhhdCdzIG5vdCBpbiB0aGUgZ2l2ZW4gbGlzdCwgaWYgd2UgdHJ5IG1vcmVcclxuICAgICAgICAvLyB0aW1lcyB0aGVuIHRoZXJlIGFyZSBzdGF0aW9ucy4gSW5hY2N1cmF0ZSwgYnV0IGF2b2lkcyBpbmZpbml0ZSBsb29wcy5cclxuICAgICAgICBpZiAoZXhjbHVkZSkgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN0YXRpb25zQ291bnQ7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoICFleGNsdWRlLmluY2x1ZGVzKHZhbHVlKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHN0YXRpb24gbmFtZSBmcm9tIHRoZSBnaXZlbiB0aHJlZSBsZXR0ZXIgY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGdldCB0aGUgbmFtZSBvZlxyXG4gICAgICogQHJldHVybnMgU3RhdGlvbiBuYW1lIGZvciB0aGUgZ2l2ZW4gY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbihjb2RlOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSB0aGlzLnN0YXRpb25zW2NvZGVdO1xyXG5cclxuICAgICAgICBpZiAoIXN0YXRpb24pXHJcbiAgICAgICAgICAgIHJldHVybiBMLkRCX1VOS05PV05fU1RBVElPTihjb2RlKTtcclxuXHJcbiAgICAgICAgaWYgKHR5cGVvZiBzdGF0aW9uID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgcmV0dXJuIFN0cmluZ3MuaXNOdWxsT3JFbXB0eShzdGF0aW9uKVxyXG4gICAgICAgICAgICAgICAgPyBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSlcclxuICAgICAgICAgICAgICAgIDogc3RhdGlvbjtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiAhc3RhdGlvbi5uYW1lXHJcbiAgICAgICAgICAgICAgICA/IEwuREJfRU1QVFlfU1RBVElPTihjb2RlKVxyXG4gICAgICAgICAgICAgICAgOiBzdGF0aW9uLm5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUncyB2b3ggYWxpYXMsIGlmIGFueS4gQSB2b3ggYWxpYXMgaXMgdGhlIGNvZGUgb2YgYW5vdGhlclxyXG4gICAgICogc3RhdGlvbidzIHZvaWNlIGZpbGUsIHRoYXQgdGhlIGdpdmVuIGNvZGUgc2hvdWxkIHVzZSBpbnN0ZWFkLiBUaGlzIGlzIHVzZWQgZm9yXHJcbiAgICAgKiBzdGF0aW9ucyB3aXRoIGR1cGxpY2F0ZSBuYW1lcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBTdGF0aW9uIGNvZGUgdG8gZ2V0IHRoZSB2b3ggYWxpYXMgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBhbGlhcyBjb2RlLCBlbHNlIHRoZSBnaXZlbiBjb2RlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uVm94KGNvZGU6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IHRoaXMuc3RhdGlvbnNbY29kZV07XHJcblxyXG4gICAgICAgIC8vIFVua25vd24gc3RhdGlvblxyXG4gICAgICAgIGlmICAgICAgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gJz8/Pyc7XHJcbiAgICAgICAgLy8gU3RhdGlvbiBpcyBqdXN0IGEgc3RyaW5nOyBhc3N1bWUgbm8gYWxpYXNcclxuICAgICAgICBlbHNlIGlmICh0eXBlb2Ygc3RhdGlvbiA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgIHJldHVybiBjb2RlO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcmV0dXJuIGVpdGhlcihzdGF0aW9uLnZveEFsaWFzLCBjb2RlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIGEgcmFuZG9tIHJhbmdlIG9mIHN0YXRpb24gY29kZXMsIGVuc3VyaW5nIHRoZXJlIGFyZSBubyBkdXBsaWNhdGVzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBtaW4gTWluaW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIG1heCBNYXhpbXVtIGFtb3VudCBvZiBzdGF0aW9ucyB0byBwaWNrXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZVxyXG4gICAgICogQHJldHVybnMgQSBsaXN0IG9mIHVuaXF1ZSBzdGF0aW9uIG5hbWVzXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwaWNrU3RhdGlvbkNvZGVzKG1pbiA9IDEsIG1heCA9IDE2LCBleGNsdWRlPyA6IHN0cmluZ1tdKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG1heCAtIG1pbiA+IE9iamVjdC5rZXlzKHRoaXMuc3RhdGlvbnMpLmxlbmd0aClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREJfVE9PX01BTllfU1RBVElPTlMoKSApO1xyXG5cclxuICAgICAgICBsZXQgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgICAgICBsZXQgbGVuZ3RoID0gUmFuZG9tLmludChtaW4sIG1heCk7XHJcbiAgICAgICAgbGV0IHRyaWVzICA9IDA7XHJcblxyXG4gICAgICAgIHdoaWxlIChyZXN1bHQubGVuZ3RoIDwgbGVuZ3RoKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcblxyXG4gICAgICAgICAgICAvLyBHaXZlIHVwIHRyeWluZyB0byBhdm9pZCBkdXBsaWNhdGVzLCBpZiB3ZSB0cnkgbW9yZSB0aW1lcyB0aGFuIHRoZXJlIGFyZVxyXG4gICAgICAgICAgICAvLyBzdGF0aW9ucyBhdmFpbGFibGUuIEluYWNjdXJhdGUsIGJ1dCBnb29kIGVub3VnaC5cclxuICAgICAgICAgICAgaWYgKHRyaWVzKysgPj0gdGhpcy5zdGF0aW9uc0NvdW50KVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIGdpdmVuIGFuIGV4Y2x1c2lvbiBsaXN0LCBjaGVjayBhZ2FpbnN0IGJvdGggdGhhdCBhbmQgcmVzdWx0c1xyXG4gICAgICAgICAgICBlbHNlIGlmICggZXhjbHVkZSAmJiAhZXhjbHVkZS5pbmNsdWRlcyhrZXkpICYmICFyZXN1bHQuaW5jbHVkZXMoa2V5KSApXHJcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgbm90LCBqdXN0IGNoZWNrIHdoYXQgcmVzdWx0cyB3ZSd2ZSBhbHJlYWR5IGZvdW5kXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCAhZXhjbHVkZSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYWluIGNsYXNzIG9mIHRoZSBlbnRpcmUgUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvciBhcHBsaWNhdGlvbiAqL1xyXG5jbGFzcyBSQUdcclxue1xyXG4gICAgLyoqIEdldHMgdGhlIGNvbmZpZ3VyYXRpb24gY29udGFpbmVyICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvbmZpZyAgIDogQ29uZmlnO1xyXG4gICAgLyoqIEdldHMgdGhlIGRhdGFiYXNlIG1hbmFnZXIsIHdoaWNoIGhvbGRzIHBocmFzZSwgc3RhdGlvbiBhbmQgdHJhaW4gZGF0YSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBkYXRhYmFzZSA6IERhdGFiYXNlO1xyXG4gICAgLyoqIEdldHMgdGhlIHBocmFzZSBtYW5hZ2VyLCB3aGljaCBnZW5lcmF0ZXMgSFRNTCBwaHJhc2VzIGZyb20gWE1MICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZXIgIDogUGhyYXNlcjtcclxuICAgIC8qKiBHZXRzIHRoZSBzcGVlY2ggZW5naW5lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNwZWVjaCAgIDogU3BlZWNoO1xyXG4gICAgLyoqIEdldHMgdGhlIGN1cnJlbnQgdHJhaW4gYW5kIHN0YXRpb24gc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGUgICAgOiBTdGF0ZTtcclxuICAgIC8qKiBHZXRzIHRoZSB2aWV3IGNvbnRyb2xsZXIsIHdoaWNoIG1hbmFnZXMgVUkgaW50ZXJhY3Rpb24gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdmlld3MgICAgOiBWaWV3cztcclxuXHJcbiAgICAvKipcclxuICAgICAqIEVudHJ5IHBvaW50IGZvciBSQUcsIHRvIGJlIGNhbGxlZCBmcm9tIEphdmFzY3JpcHQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGRhdGFSZWZzIENvbmZpZ3VyYXRpb24gb2JqZWN0LCB3aXRoIHJhaWwgZGF0YSB0byB1c2VcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBtYWluKGRhdGFSZWZzOiBEYXRhUmVmcykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93Lm9uZXJyb3IgICAgICAgICAgICAgID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuICAgICAgICB3aW5kb3cub251bmhhbmRsZWRyZWplY3Rpb24gPSBlcnJvciA9PiBSQUcucGFuaWMoZXJyb3IpO1xyXG5cclxuICAgICAgICBJMThuLmluaXQoKTtcclxuXHJcbiAgICAgICAgUkFHLmNvbmZpZyAgID0gbmV3IENvbmZpZyh0cnVlKTtcclxuICAgICAgICBSQUcuZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2UoZGF0YVJlZnMpO1xyXG4gICAgICAgIFJBRy52aWV3cyAgICA9IG5ldyBWaWV3cygpO1xyXG4gICAgICAgIFJBRy5waHJhc2VyICA9IG5ldyBQaHJhc2VyKCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaCAgID0gbmV3IFNwZWVjaCgpO1xyXG5cclxuICAgICAgICAvLyBCZWdpblxyXG5cclxuICAgICAgICBSQUcudmlld3MuZGlzY2xhaW1lci5kaXNjbGFpbSgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChMLldFTENPTUUpO1xyXG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZW5lcmF0ZXMgYSBuZXcgcmFuZG9tIHBocmFzZSBhbmQgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBuZXcgU3RhdGUoKTtcclxuICAgICAgICBSQUcuc3RhdGUuZ2VuRGVmYXVsdFN0YXRlKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBMb2FkcyBzdGF0ZSBmcm9tIGdpdmVuIEpTT04gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbG9hZChqc29uOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IE9iamVjdC5hc3NpZ24oIG5ldyBTdGF0ZSgpLCBKU09OLnBhcnNlKGpzb24pICkgYXMgU3RhdGU7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChMLlNUQVRFX0ZST01fU1RPUkFHRSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdsb2JhbCBlcnJvciBoYW5kbGVyOyB0aHJvd3MgdXAgYSBiaWcgcmVkIHBhbmljIHNjcmVlbiBvbiB1bmNhdWdodCBlcnJvciAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcGFuaWMoZXJyb3I6IHN0cmluZyB8IEV2ZW50ID0gXCJVbmtub3duIGVycm9yXCIpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG1zZyA9ICc8ZGl2IGlkPVwicGFuaWNTY3JlZW5cIiBjbGFzcz1cIndhcm5pbmdTY3JlZW5cIj4nICAgICAgICAgICtcclxuICAgICAgICAgICAgICAgICAgJzxoMT5cIldlIGFyZSBzb3JyeSB0byBhbm5vdW5jZSB0aGF0Li4uXCI8L2gxPicgICAgICAgICAgICtcclxuICAgICAgICAgICAgICAgICAgYDxwPlJBRyBoYXMgY3Jhc2hlZCBiZWNhdXNlOiA8Y29kZT4ke2Vycm9yfTwvY29kZT48L3A+YCArXHJcbiAgICAgICAgICAgICAgICAgIGA8cD5QbGVhc2Ugb3BlbiB0aGUgY29uc29sZSBmb3IgbW9yZSBpbmZvcm1hdGlvbi48L3A+YCAgK1xyXG4gICAgICAgICAgICAgICAgICAnPC9kaXY+JztcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5pbm5lckhUTUwgPSBtc2c7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEaXNwb3NhYmxlIGNsYXNzIHRoYXQgaG9sZHMgc3RhdGUgZm9yIHRoZSBjdXJyZW50IHNjaGVkdWxlLCB0cmFpbiwgZXRjLiAqL1xyXG5jbGFzcyBTdGF0ZVxyXG57XHJcbiAgICAvKiogU3RhdGUgb2YgY29sbGFwc2libGUgZWxlbWVudHMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGNvbGxhcHNlZC4gKi9cclxuICAgIHByaXZhdGUgX2NvbGxhcHNpYmxlcyA6IERpY3Rpb25hcnk8Ym9vbGVhbj4gID0ge307XHJcbiAgICAvKiogQ3VycmVudCBjb2FjaCBsZXR0ZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGxldHRlci4gKi9cclxuICAgIHByaXZhdGUgX2NvYWNoZXMgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBpbnRlZ2VyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBpbnRlZ2VyLiAqL1xyXG4gICAgcHJpdmF0ZSBfaW50ZWdlcnMgICAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHBocmFzZXNldCBwaHJhc2UgY2hvaWNlcy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgaW5kZXguICovXHJcbiAgICBwcml2YXRlIF9waHJhc2VzZXRzICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc2VydmljZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc2VydmljZS4gKi9cclxuICAgIHByaXZhdGUgX3NlcnZpY2VzICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzdGF0aW9uIGNvZGUuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9ucyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBsaXN0IGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBhcnJheSBvZiBjb2Rlcy4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25MaXN0cyA6IERpY3Rpb25hcnk8c3RyaW5nW10+ID0ge307XHJcbiAgICAvKiogQ3VycmVudCB0aW1lIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyB0aW1lLiAqL1xyXG4gICAgcHJpdmF0ZSBfdGltZXMgICAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuXHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBleGN1c2UgKi9cclxuICAgIHByaXZhdGUgX2V4Y3VzZT8gICA6IHN0cmluZztcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIHBsYXRmb3JtICovXHJcbiAgICBwcml2YXRlIF9wbGF0Zm9ybT8gOiBQbGF0Zm9ybTtcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIG5hbWVkIHRyYWluICovXHJcbiAgICBwcml2YXRlIF9uYW1lZD8gICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGNvYWNoIGxldHRlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lIGZyb20gQSB0byBaLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgbGV0dGVyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29hY2goY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2FjaGVzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gUmFuZG9tLmFycmF5KEwuTEVUVEVSUyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29hY2ggbGV0dGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29hY2ggVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2FjaChjb250ZXh0OiBzdHJpbmcsIGNvYWNoOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBjb2FjaDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBiZXR3ZWVuIDAgYW5kIDEwMCBvZiBjaG9vc2luZyB0cnVlLCBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBjaGFuY2U6IG51bWJlcikgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSAhUmFuZG9tLmJvb2woY2hhbmNlKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29sbGFwc2libGUncyBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVmFsdWUgdG8gc2V0LCB3aGVyZSB0cnVlIGlzIFwiY29sbGFwc2VkXCJcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvbGxhcHNlZChyZWY6IHN0cmluZywgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gc3RhdGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGludGVnZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5faW50ZWdlcnNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMCwgbWF4ID0gMDtcclxuXHJcbiAgICAgICAgc3dpdGNoKGNvbnRleHQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29hY2hlc1wiOiAgICAgICBtaW4gPSAxOyBtYXggPSAxMDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJkZWxheWVkXCI6ICAgICAgIG1pbiA9IDU7IG1heCA9IDYwOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImZyb250X2NvYWNoZXNcIjogbWluID0gMjsgbWF4ID0gNTsgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicmVhcl9jb2FjaGVzXCI6ICBtaW4gPSAyOyBtYXggPSA1OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYW4gaW50ZWdlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEludGVnZXIoY29udGV4dDogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBwaHJhc2Ugb2YgYSBwaHJhc2VzZXQsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBwaHJhc2VzZXQncyBwaHJhc2Ugb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldElkeChyZWY6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG4gICAgICAgIGxldCBpZHggICAgICAgPSB0aGlzLl9waHJhc2VzZXRzW3JlZl07XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGludHJvZHVjZSBhbiBhc3NlcnRzIHV0aWwsIGFuZCBzdGFydCB1c2luZyB0aGVtIGFsbCBvdmVyXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlNUQVRFX0JBRF9QSFJBU0VTRVQocmVmKSApO1xyXG5cclxuICAgICAgICAvLyBWZXJpZnkgaW5kZXggaXMgdmFsaWQsIGVsc2UgcmVqZWN0IGFuZCBwaWNrIHJhbmRvbVxyXG4gICAgICAgIGlmIChpZHggPT09IHVuZGVmaW5lZCB8fCBwaHJhc2VzZXQuY2hpbGRyZW5baWR4XSA9PT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBSYW5kb20uaW50KDAsIHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGggLSAxKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNob3NlbiBpbmRleCBmb3IgYSBwaHJhc2VzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBwaHJhc2VzZXQgaW5kZXggb2ZcclxuICAgICAqIEBwYXJhbSBpZHggSW5kZXggdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcsIGlkeDogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBpZHg7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHNlcnZpY2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc2VydmljZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU2VydmljZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzZXJ2aWNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzZXJ2aWNlIGZvclxyXG4gICAgICogQHBhcmFtIHNlcnZpY2UgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZywgc2VydmljZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IHNlcnZpY2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHN0YXRpb24gY29kZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzdGF0aW9uIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBmb3JcclxuICAgICAqIEBwYXJhbSBjb2RlIFN0YXRpb24gY29kZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb24oY29udGV4dDogc3RyaW5nLCBjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gY29kZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gbGlzdCBvZiBzdGF0aW9uIGNvZGVzLCBvciByYW5kb21seSBnZW5lcmF0ZXMgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBsaXN0IGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbkxpc3QoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgICAgIGVsc2UgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmcnKTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDEsIG1heCA9IDE2O1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NhbGxpbmdfc3BsaXQnOiBtaW4gPSAyOyBtYXggPSAxNjsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NoYW5nZXMnOiAgICAgICBtaW4gPSAxOyBtYXggPSA0OyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ25vdF9zdG9wcGluZyc6ICBtaW4gPSAxOyBtYXggPSA4OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcyhtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBsaXN0IG9mIHN0YXRpb24gY29kZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBsaXN0IGZvclxyXG4gICAgICogQHBhcmFtIGNvZGVzIFN0YXRpb24gY29kZXMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcsIGNvZGVzOiBzdHJpbmdbXSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdID0gY29kZXM7XHJcblxyXG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnY2FsbGluZ19maXJzdCcpXHJcbiAgICAgICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1snY2FsbGluZyddID0gY29kZXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHRpbWVcclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHRpbWUgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRUaW1lKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fdGltZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IFN0cmluZ3MuZnJvbVRpbWUoIFJhbmRvbS5pbnQoMCwgMjMpLCBSYW5kb20uaW50KDAsIDU5KSApO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl90aW1lc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSB0aW1lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSB0aW1lIGZvclxyXG4gICAgICogQHBhcmFtIHRpbWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRUaW1lKGNvbnRleHQ6IHN0cmluZywgdGltZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IHRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBleGN1c2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBleGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9leGN1c2UpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9leGN1c2U7XHJcblxyXG4gICAgICAgIHRoaXMuX2V4Y3VzZSA9IFJBRy5kYXRhYmFzZS5waWNrRXhjdXNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBzZXQgZXhjdXNlKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBwbGF0Zm9ybSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IHBsYXRmb3JtKCkgOiBQbGF0Zm9ybVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9wbGF0Zm9ybSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXRmb3JtO1xyXG5cclxuICAgICAgICBsZXQgcGxhdGZvcm0gOiBQbGF0Zm9ybSA9IFsnJywgJyddO1xyXG5cclxuICAgICAgICAvLyBPbmx5IDIlIGNoYW5jZSBmb3IgcGxhdGZvcm0gMCwgc2luY2UgaXQncyByYXJlXHJcbiAgICAgICAgcGxhdGZvcm1bMF0gPSBSYW5kb20uYm9vbCg5OClcclxuICAgICAgICAgICAgPyBSYW5kb20uaW50KDEsIDI2KS50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogJzAnO1xyXG5cclxuICAgICAgICAvLyBNYWdpYyB2YWx1ZXNcclxuICAgICAgICBpZiAocGxhdGZvcm1bMF0gPT09ICc5JylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgyNSkgPyAnwr4nIDogJyc7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMTAlIGNoYW5jZSBmb3IgcGxhdGZvcm0gbGV0dGVyLCBzaW5jZSBpdCdzIHVuY29tbW9uXHJcbiAgICAgICAgaWYgKHBsYXRmb3JtWzFdID09PSAnJylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgxMClcclxuICAgICAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCdBQkMnKVxyXG4gICAgICAgICAgICAgICAgOiAnJztcclxuXHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSBwbGF0Zm9ybTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzZXQgcGxhdGZvcm0odmFsdWU6IFBsYXRmb3JtKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBuYW1lZCB0cmFpbiwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IG5hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fbmFtZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuXHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSBSQUcuZGF0YWJhc2UucGlja05hbWVkKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc2V0IG5hbWVkKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgdGhlIHN0YXRlIGluIGEgcGFydGljdWxhciB3YXksIHNvIHRoYXQgaXQgbWFrZXMgc29tZSByZWFsLXdvcmxkIHNlbnNlLlxyXG4gICAgICogVG8gZG8gc28sIHdlIGhhdmUgdG8gZ2VuZXJhdGUgZGF0YSBpbiBhIHBhcnRpY3VsYXIgb3JkZXIsIGFuZCBtYWtlIHN1cmUgdG8gYXZvaWRcclxuICAgICAqIGR1cGxpY2F0ZXMgaW4gaW5hcHByb3ByaWF0ZSBwbGFjZXMgYW5kIGNvbnRleHRzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2VuRGVmYXVsdFN0YXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RlcCAxLiBQcmVwb3B1bGF0ZSBzdGF0aW9uIGxpc3RzXHJcblxyXG4gICAgICAgIGxldCBzbENhbGxpbmcgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDE2KTtcclxuICAgICAgICBsZXQgc2xDYWxsU3BsaXQgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygyLCAxNiwgc2xDYWxsaW5nKTtcclxuICAgICAgICBsZXQgYWxsQ2FsbGluZyAgPSBbLi4uc2xDYWxsaW5nLCAuLi5zbENhbGxTcGxpdF07XHJcblxyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgZm91bmQgdmlhIGEgc3BlY2lmaWMgY2FsbGluZyBwb2ludFxyXG4gICAgICAgIGxldCBzbENoYW5nZXMgICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgNCwgYWxsQ2FsbGluZyk7XHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyB0aGF0IHRoaXMgdHJhaW4gdXN1YWxseSBzZXJ2ZXMsIGJ1dCBjdXJyZW50bHkgaXNuJ3RcclxuICAgICAgICBsZXQgc2xOb3RTdG9wcGluZyA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDgsXHJcbiAgICAgICAgICAgIFsuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXNdXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGFrZSBhIHJhbmRvbSBzbGljZSBmcm9tIHRoZSBjYWxsaW5nIGxpc3QsIHRvIGlkZW50aWZ5IGFzIHJlcXVlc3Qgc3RvcHNcclxuICAgICAgICBsZXQgcmVxQ291bnQgICA9IFJhbmRvbS5pbnQoMSwgc2xDYWxsaW5nLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGxldCBzbFJlcXVlc3RzID0gc2xDYWxsaW5nLnNsaWNlKDAsIHJlcUNvdW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZycsICAgICAgIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZ19zcGxpdCcsIHNsQ2FsbFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjaGFuZ2VzJywgICAgICAgc2xDaGFuZ2VzKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdub3Rfc3RvcHBpbmcnLCAgc2xOb3RTdG9wcGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgncmVxdWVzdCcsICAgICAgIHNsUmVxdWVzdHMpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDIuIFByZXBvcHVsYXRlIHN0YXRpb25zXHJcblxyXG4gICAgICAgIC8vIEFueSBzdGF0aW9uIG1heSBiZSBibGFtZWQgZm9yIGFuIGV4Y3VzZSwgZXZlbiBvbmVzIGFscmVhZHkgcGlja2VkXHJcbiAgICAgICAgbGV0IHN0RXhjdXNlICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiBpcyBmaW5hbCBjYWxsIG9mIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0ICAgID0gc2xDYWxsaW5nW3NsQ2FsbGluZy5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBWaWEgaXMgYSBjYWxsIGJlZm9yZSB0aGUgZGVzdGluYXRpb24sIG9yIG9uZSBpbiB0aGUgc3BsaXQgbGlzdCBpZiB0b28gc21hbGxcclxuICAgICAgICBsZXQgc3RWaWEgICAgID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBEaXR0byBmb3IgcGlja2luZyBhIHJhbmRvbSBjYWxsaW5nIHN0YXRpb24gYXMgYSBzaW5nbGUgcmVxdWVzdCBvciBjaGFuZ2Ugc3RvcFxyXG4gICAgICAgIGxldCBzdENhbGxpbmcgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG5cclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiAobGFzdCBjYWxsKSBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3RTcGxpdCA9IHNsQ2FsbFNwbGl0W3NsQ2FsbFNwbGl0Lmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFJhbmRvbSBub24tZGVzdGluYXRpb24gc3RvcCBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdFZpYVNwbGl0ICA9IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gV2hlcmUgdGhlIHRyYWluIGNvbWVzIGZyb20sIHNvIGNhbid0IGJlIG9uIGFueSBsaXN0cyBvciBwcmlvciBzdGF0aW9uc1xyXG4gICAgICAgIGxldCBzdFNvdXJjZSAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoW1xyXG4gICAgICAgICAgICAuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXMsIC4uLnNsTm90U3RvcHBpbmcsIC4uLnNsUmVxdWVzdHMsXHJcbiAgICAgICAgICAgIHN0Q2FsbGluZywgc3REZXN0LCBzdFZpYSwgc3REZXN0U3BsaXQsIHN0VmlhU3BsaXRcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdjYWxsaW5nJywgICAgICAgICAgIHN0Q2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbicsICAgICAgIHN0RGVzdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbl9zcGxpdCcsIHN0RGVzdFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2V4Y3VzZScsICAgICAgICAgICAgc3RFeGN1c2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignc291cmNlJywgICAgICAgICAgICBzdFNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWEnLCAgICAgICAgICAgICAgIHN0VmlhKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYV9zcGxpdCcsICAgICAgICAgc3RWaWFTcGxpdCk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMy4gUHJlcG9wdWxhdGUgY29hY2ggbnVtYmVyc1xyXG5cclxuICAgICAgICBsZXQgaW50Q29hY2hlcyA9IHRoaXMuZ2V0SW50ZWdlcignY29hY2hlcycpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGp1c3Qgc3BsaXQgdGhlIG51bWJlciBkb3duIHRoZSBtaWRkbGUgaW5zdGVhZC5cclxuICAgICAgICAvLyBFbHNlLCBmcm9udCBhbmQgcmVhciBjb2FjaGVzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGludEZyb250Q29hY2hlcyA9IChpbnRDb2FjaGVzIC8gMikgfCAwO1xyXG4gICAgICAgICAgICBsZXQgaW50UmVhckNvYWNoZXMgID0gaW50Q29hY2hlcyAtIGludEZyb250Q29hY2hlcztcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcignZnJvbnRfY29hY2hlcycsIGludEZyb250Q29hY2hlcyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcigncmVhcl9jb2FjaGVzJywgaW50UmVhckNvYWNoZXMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBhc3NpZ24gY29hY2ggbGV0dGVycyBmb3IgY29udGV4dHMuXHJcbiAgICAgICAgLy8gRWxzZSwgbGV0dGVycyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsZXR0ZXJzID0gTC5MRVRURVJTLnNsaWNlKDAsIGludENvYWNoZXMpLnNwbGl0KCcnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdmaXJzdCcsICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3Nob3AnLCAgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQxJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDInLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNC4gUHJlcG9wdWxhdGUgc2VydmljZXNcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBzZXJ2aWNlLCBwaWNrIG9uZSB0byBiZSB0aGUgXCJtYWluXCIgYW5kIG9uZSB0byBiZSB0aGVcclxuICAgICAgICAvLyBcImFsdGVybmF0ZVwiLCBlbHNlIHRoZSBvbmUgc2VydmljZSB3aWxsIGJlIHVzZWQgZm9yIGJvdGggKHdpdGhvdXQgbWFraW5nIHNlbnNlKS5cclxuICAgICAgICBpZiAoUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmxlbmd0aCA+IDEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgc2VydmljZXMgPSBSQUcuZGF0YWJhc2Uuc2VydmljZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ3Byb3ZpZGVyJywgICAgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdhbHRlcm5hdGl2ZScsIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNS4gUHJlcG9wdWxhdGUgdGltZXNcclxuICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTIxNDc1M1xyXG5cclxuICAgICAgICAvLyBUaGUgYWx0ZXJuYXRpdmUgdGltZSBpcyBmb3IgYSB0cmFpbiB0aGF0J3MgbGF0ZXIgdGhhbiB0aGUgbWFpbiB0cmFpblxyXG4gICAgICAgIGxldCB0aW1lICAgID0gbmV3IERhdGUoIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgUmFuZG9tLmludCgwLCA1OSkgKiA2MDAwMCk7XHJcbiAgICAgICAgbGV0IHRpbWVBbHQgPSBuZXcgRGF0ZSggdGltZS5nZXRUaW1lKCkgICAgICAgKyBSYW5kb20uaW50KDAsIDMwKSAqIDYwMDAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnbWFpbicsICAgICAgICBTdHJpbmdzLmZyb21UaW1lKHRpbWUpICAgICk7XHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnYWx0ZXJuYXRpdmUnLCBTdHJpbmdzLmZyb21UaW1lKHRpbWVBbHQpICk7XHJcbiAgICB9XHJcbn0iXX0=