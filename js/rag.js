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
/** Conditions the dashboard offers, in the order they appear in the editor */
const DASH_BRANCH_CONDITIONS = [
    { id: 'delay', label: 'Delayed by at least (minutes)', input: 'number', min: '0' },
    { id: 'random', label: 'Chance of taking it (%)', input: 'number', min: '0', max: '100' },
    { id: 'time', label: 'Current hour is at least (0-23)', input: 'number', min: '0', max: '23' },
    { id: 'platform', label: 'Platform is', input: 'text', placeholder: 'e.g. 2 or 9¾' },
    { id: 'service', label: 'Service contains', input: 'text', placeholder: 'e.g. express' }
];
class ScenarioDashboard {
    constructor() {
        this.storageKey = 'rag.scenarios';
        this.scenarios = [];
        this.currentId = null;
        this.progressTextEl = null;
        this.progressFillEl = null;
        /** Index of the step whose inline branch editor is open, or -1 when closed */
        this.branchEditorIdx = -1;
        /** Staged branches of the open editor (committed on "Save all") */
        this.branchEditorRows = [];
        /** Condition preselected in the editor's "new branch" row */
        this.branchNewCond = 'delay';
        /** Heartbeat timer keeping the cross-tab playback lock fresh */
        this.playHeartbeat = 0;
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
    /** Shows the panel; called when this page is running in the dashboard role */
    open() {
        this.panel.hidden = false;
        this.render();
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
        this.branchEditorIdx = -1;
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
                    sc.steps.forEach(st => this.normalizeStepBranches(st));
            });
        }
        catch (e) {
            this.scenarios = [];
        }
    }
    /**
     * Migrate the legacy single branch onto branches[] and drop rows that
     * are not usable at run time. Runs on load and import so the rest of
     * the app only ever sees the ordered-list shape.
     */
    normalizeStepBranches(st) {
        if (st.branch && (!st.branches || st.branches.length === 0)) {
            st.branches = [st.branch];
            st.branch = undefined;
        }
        if (st.branches) {
            let kept = st.branches.filter(b => b && typeof b.condition === 'string' && b.target !== undefined);
            st.branches = kept.length > 0 ? kept : undefined;
        }
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
        this.setPlaybackActive(true);
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
        this.setPlaybackActive(true);
        RAG.scenario.clear();
        RAG.scenario.setSteps(s.steps);
        RAG.scenario.playStep(idx);
        RAG.views.marquee.set('Playing step ' + (idx + 1) + ' only.');
    }
    onPlaybackEnded() {
        this.setPlaybackActive(false);
        this.setEditingEnabled(true);
        this.highlightStep(-1);
        this.updateProgress(-1, 0);
        this.setNowPlaying('Idle', false);
    }
    /**
     * Cross-tab lock. Other tabs (the editor role) read rag.playbackActive
     * and react to the storage event; the heartbeat keeps the lock fresh so
     * a closed dashboard tab cannot leave the editor locked forever.
     */
    setPlaybackActive(active) {
        if (active) {
            localStorage.setItem('rag.playbackActive', '1');
            this.playHeartbeatTick();
            this.playHeartbeat = window.setInterval(() => this.playHeartbeatTick(), 5000);
        }
        else {
            clearInterval(this.playHeartbeat);
            this.playHeartbeat = 0;
            localStorage.removeItem('rag.playbackActive');
        }
    }
    playHeartbeatTick() {
        localStorage.setItem('rag.playbackSince', String(Date.now()));
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
                <button id="dashClose" type="button" title="Hide the dashboard panel and show the announcement screen">Hide panel</button>
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
        let branchCount = (st.branches ? st.branches.length : 0) + (st.branch ? 1 : 0);
        let branchTag = '';
        if (branchCount === 1) {
            let b = (st.branches && st.branches.length > 0) ? st.branches[0] : st.branch;
            if (b)
                branchTag = ' <span class="dash-branch-tag">→ ' + this.branchSummary(b) + '</span>';
        }
        else if (branchCount > 1) {
            branchTag = ' <span class="dash-branch-tag">→ ' + branchCount + ' branches</span>';
        }
        let labelInput = `<label class="dash-field">Label <input class="dash-label" type="text" data-idx="${i}" value="${this.esc(st.label || '')}" placeholder="optional" title="Optional label; other steps can branch to it"></label>`;
        let gapInput = st.type === 'announcement'
            ? `<label class="dash-field">Gap (ms) <input class="dash-gap" type="number" data-idx="${i}" value="${st.gapMs}" min="0" step="100" title="Pause after this step, in milliseconds"></label>`
            : '';
        let waitInput = st.type === 'wait'
            ? `<label class="dash-field">Wait (s) <input class="dash-wait" type="number" data-idx="${i}" value="${st.waitSeconds || 0}" min="0" step="1" title="Silent pause, in seconds"></label>`
            : '';
        let annButtons = st.type === 'announcement'
            ? `<button class="dash-edit" type="button" data-idx="${i}" title="Open this step in the editor to change it">Edit</button>
               <button class="dash-branch-toggle" type="button" data-idx="${i}" title="Branch: jump elsewhere when a condition is met">Branch</button>`
            : '';
        return `<div class="dash-step" data-idx="${i}">
            <div class="dash-step-title"><span>${title}</span>${branchTag}</div>
            <div class="dash-row">
                ${labelInput}
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
            ${this.branchEditorIdx === i ? this.branchEditorHtml(s, i) : ''}
        </div>`;
    }
    /** Human-readable one-liner shown next to the step title */
    branchSummary(b) {
        let thr = b.threshold === undefined ? '' : (' ' + String(b.threshold));
        let target;
        if (b.target === 'end')
            target = 'end';
        else if (typeof b.target === 'number')
            target = 'step ' + (b.target + 1);
        else
            target = 'label "' + b.target + '"';
        return this.esc(b.condition + thr + ' → ' + target);
    }
    /** Resolves the spec for a condition id, falling back to the first one */
    specFor(cond) {
        let spec = DASH_BRANCH_CONDITIONS.filter(c => c.id === cond)[0];
        return spec || DASH_BRANCH_CONDITIONS[0];
    }
    /** Copies one branch so staged edits cannot leak into the live step */
    copyBranch(b) {
        return { condition: b.condition, threshold: b.threshold, probability: b.probability, target: b.target, label: b.label };
    }
    /** Seeds the editor's staged rows from a step's branches (or one blank row) */
    seedBranchRows(st) {
        let rows = [];
        if (st) {
            if (st.branches)
                rows = st.branches.map(b => this.copyBranch(b));
            else if (st.branch)
                rows = [this.copyBranch(st.branch)];
        }
        if (rows.length === 0)
            rows = [{ condition: 'delay', threshold: undefined, target: 'end' }];
        this.branchEditorRows = rows;
        this.branchNewCond = 'delay';
    }
    branchEditorHtml(s, i) {
        let rows = this.branchEditorRows;
        let rowHtml = rows.map((b, k) => {
            let spec = this.specFor(b.condition);
            let thr = b.threshold === undefined ? '' : String(b.threshold);
            let condOpts = DASH_BRANCH_CONDITIONS.map(c => `<option value="${c.id}" ${c.id === b.condition ? 'selected' : ''}>${c.label}</option>`).join('');
            let thrAttrs = spec.input === 'number'
                ? `type="number" min="${spec.min || '0'}" ${spec.max !== undefined ? 'max="' + spec.max + '"' : ''}`
                : `type="text" placeholder="${this.esc(spec.placeholder || '')}"`;
            return `<div class="dash-branch-row">
                <div class="dash-row">
                    <select class="dash-branch-cond" data-row="${k}" title="Branch condition">${condOpts}</select>
                    <input class="dash-branch-thr" data-row="${k}" value="${this.esc(thr)}" ${thrAttrs} title="Value for this condition">
                </div>
                <div class="dash-row">
                    <select class="dash-branch-target" data-row="${k}" title="Where to jump to">${this.targetOptions(s, b)}</select>
                    <span class="dash-row-btns">
                        <button class="dash-branch-up" type="button" data-row="${k}" title="Higher priority (checked earlier)" ${k > 0 ? '' : 'disabled'}>↑</button>
                        <button class="dash-branch-down" type="button" data-row="${k}" title="Lower priority (checked later)" ${k < rows.length - 1 ? '' : 'disabled'}>↓</button>
                        <button class="dash-branch-del" type="button" data-row="${k}" title="Remove this branch">✕</button>
                    </span>
                </div>
            </div>`;
        }).join('');
        let newOpts = DASH_BRANCH_CONDITIONS.map(c => `<option value="${c.id}" ${c.id === this.branchNewCond ? 'selected' : ''}>${c.label}</option>`).join('');
        return `<div class="dash-branch-editor">
            <div class="dash-branch-hint">If / elif: branches are checked top to bottom and the first match wins. If none match, the scenario continues with the next step (else).</div>
            ${rowHtml}
            <div class="dash-row">
                <select class="dash-branch-newcond" title="Condition for the new branch">${newOpts}</select>
                <button class="dash-branch-add" type="button" data-idx="${i}">+ Add branch</button>
            </div>
            <div class="dash-row">
                <span class="dash-row-btns">
                    <button class="dash-branch-save" type="button" data-idx="${i}">Save all</button>
                    <button class="dash-branch-cancel" type="button">Cancel</button>
                </span>
            </div>
        </div>`;
    }
    /**
     * Target options: "end", every step by index, and every labelled step by
     * label. Index options are stored 0-based; label options as the label.
     */
    targetOptions(s, b) {
        let cur = b ? String(b.target) : 'end';
        let opts = ['<option value="end"' + (cur === 'end' ? ' selected' : '') + '>→ end of scenario</option>'];
        s.steps.forEach((st, j) => {
            opts.push(`<option value="idx:${j}" ${cur === 'idx:' + j ? ' selected' : ''}>→ step ${j + 1}${st.label ? ' (' + this.esc(st.label) + ')' : ''}</option>`);
            if (st.label)
                opts.push(`<option value="label:${this.esc(st.label)}" ${cur === 'label:' + st.label ? ' selected' : ''}>→ label "${this.esc(st.label)}"</option>`);
        });
        // Honour a label target that no longer matches any step (it falls
        // back to "end" at run time)
        if (b && typeof b.target === 'string' && b.target !== 'end' && !s.steps.some(st => st.label === b.target))
            opts.push(`<option value="label:${this.esc(b.target)}" selected>→ label "${this.esc(b.target)}" (not found)</option>`);
        return opts.join('');
    }
    // ── Event binding ────────────────────────────────────────────────────
    bind() {
        let panel = this.panel;
        panel.querySelectorAll('.dash-scen').forEach(li => {
            li.addEventListener('click', () => {
                this.currentId = li.dataset['id'] || null;
                if (this.currentId)
                    localStorage.setItem('rag.currentScenarioId', this.currentId);
                this.branchEditorIdx = -1;
                this.render();
            });
        });
        let btnClose = panel.querySelector('#dashClose');
        if (btnClose)
            btnClose.onclick = () => { this.panel.hidden = true; };
        let btnNew = panel.querySelector('#dashNew');
        if (btnNew)
            btnNew.onclick = () => {
                let id = 'scn_' + Date.now();
                this.scenarios.push({ id: id, name: 'Scenario ' + (this.scenarios.length + 1), steps: [], loopCount: 1, createdAt: Date.now(), updatedAt: Date.now() });
                this.currentId = id;
                this.branchEditorIdx = -1;
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
        panel.querySelectorAll('.dash-branch-toggle').forEach(b => {
            b.addEventListener('click', () => {
                let idx = parseInt(b.dataset['idx'] || '0', 10);
                let s = this.current();
                if (!s)
                    return;
                this.branchEditorIdx = idx;
                this.seedBranchRows(s.steps[idx]);
                this.render();
            });
        });
        panel.querySelectorAll('.dash-branch-cond').forEach(sel => {
            sel.addEventListener('change', () => {
                let row = parseInt(sel.dataset['row'] || '0', 10);
                let r = this.branchEditorRows[row];
                if (!r)
                    return;
                r.condition = sel.value;
                // The meaning of the value depends on the condition, so start
                // the row's value fresh instead of carrying the old one over.
                r.threshold = undefined;
                r.probability = undefined;
                this.render();
            });
        });
        panel.querySelectorAll('.dash-branch-thr').forEach(inp => {
            inp.addEventListener('change', () => {
                let row = parseInt(inp.dataset['row'] || '0', 10);
                let r = this.branchEditorRows[row];
                if (!r)
                    return;
                let v = inp.value.trim();
                if (v === '')
                    r.threshold = undefined;
                else if (this.specFor(r.condition).input === 'number')
                    r.threshold = parseFloat(v);
                else
                    r.threshold = v;
                this.render();
            });
        });
        panel.querySelectorAll('.dash-branch-target').forEach(sel => {
            sel.addEventListener('change', () => {
                let row = parseInt(sel.dataset['row'] || '0', 10);
                let r = this.branchEditorRows[row];
                if (!r)
                    return;
                let raw = sel.value;
                if (raw === 'end')
                    r.target = 'end';
                else if (raw.indexOf('idx:') === 0)
                    r.target = parseInt(raw.substring(4), 10);
                else
                    r.target = raw.substring(6);
            });
        });
        let newCond = panel.querySelector('.dash-branch-newcond');
        if (newCond) {
            newCond.addEventListener('change', () => {
                this.branchNewCond = newCond.value;
            });
        }
        panel.querySelectorAll('.dash-branch-add').forEach(b => {
            b.addEventListener('click', () => {
                this.branchEditorRows.push({ condition: this.branchNewCond, threshold: undefined, target: 'end' });
                this.render();
            });
        });
        panel.querySelectorAll('.dash-branch-up').forEach(b => {
            b.addEventListener('click', () => {
                this.moveBranchRow(parseInt(b.dataset['row'] || '0', 10), -1);
            });
        });
        panel.querySelectorAll('.dash-branch-down').forEach(b => {
            b.addEventListener('click', () => {
                this.moveBranchRow(parseInt(b.dataset['row'] || '0', 10), 1);
            });
        });
        panel.querySelectorAll('.dash-branch-del').forEach(b => {
            b.addEventListener('click', () => {
                let k = parseInt(b.dataset['row'] || '0', 10);
                if (this.branchEditorRows.length > 0)
                    this.branchEditorRows.splice(k, 1);
                this.render();
            });
        });
        panel.querySelectorAll('.dash-branch-save').forEach(b => {
            b.addEventListener('click', () => this.saveBranch(parseInt(b.dataset['idx'] || '0', 10)));
        });
        panel.querySelectorAll('.dash-branch-cancel').forEach(b => {
            b.addEventListener('click', () => {
                this.branchEditorIdx = -1;
                this.render();
            });
        });
        panel.querySelectorAll('.dash-stepplay').forEach(b => {
            b.addEventListener('click', () => {
                let idx = parseInt(b.dataset['idx'] || '0', 10);
                this.playStepOnly(idx);
            });
        });
        panel.querySelectorAll('.dash-label').forEach(inp => {
            inp.addEventListener('change', () => {
                let idx = parseInt(inp.dataset['idx'] || '0', 10);
                let s = this.current();
                if (!s)
                    return;
                s.steps[idx].label = inp.value;
                s.updatedAt = Date.now();
                this.saveAll();
                this.render();
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
    /** Opens the editor role in a new tab with this step loaded for editing */
    editStep(idx) {
        let s = this.current();
        if (!s || !s.steps[idx])
            return;
        if (s.steps[idx].type !== 'announcement' || !s.steps[idx].stateJson) {
            alert('This step has no announcement state to edit.');
            return;
        }
        localStorage.setItem('rag.currentScenarioId', s.id);
        localStorage.setItem('rag.selectedStepIndex', String(idx));
        localStorage.setItem('rag.editRequest', '1');
        window.open('index.html', '_blank');
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
        if (this.branchEditorIdx === idx)
            this.branchEditorIdx = -1;
        this.saveAll();
        this.render();
    }
    /** Swaps a staged branch row with its neighbour (reorder priority) */
    moveBranchRow(k, dir) {
        let j = k + dir;
        if (j < 0 || j >= this.branchEditorRows.length || k < 0 || k >= this.branchEditorRows.length)
            return;
        let tmp = this.branchEditorRows[k];
        this.branchEditorRows[k] = this.branchEditorRows[j];
        this.branchEditorRows[j] = tmp;
        this.render();
    }
    /** Validates every staged row; returns an error message or null when all are usable */
    branchRowsError() {
        for (let k = 0; k < this.branchEditorRows.length; k++) {
            let b = this.branchEditorRows[k];
            let spec = this.specFor(b.condition);
            if (spec.input === 'number') {
                if (b.threshold === undefined || typeof b.threshold !== 'number' || isNaN(b.threshold))
                    return 'Branch ' + (k + 1) + ': enter a number for the condition, or remove that branch.';
            }
            else {
                if (b.threshold === undefined || String(b.threshold).trim() === '')
                    return 'Branch ' + (k + 1) + ': enter a value for the condition, or remove that branch.';
            }
        }
        return null;
    }
    saveBranch(idx) {
        let s = this.current();
        if (!s || !s.steps[idx])
            return;
        let err = this.branchRowsError();
        if (err) {
            alert(err);
            return;
        }
        let st = s.steps[idx];
        if (this.branchEditorRows.length > 0)
            st.branches = this.branchEditorRows.slice();
        else
            st.branches = undefined;
        st.branch = undefined; // drop the legacy single-branch alias
        s.updatedAt = Date.now();
        this.branchEditorIdx = -1;
        this.saveAll();
        this.render();
    }
    // ── Import / export ──────────────────────────────────────────────────
    exportJson() {
        // Guarantee the exported shape: only branches[] (no legacy branch)
        this.scenarios.forEach(sc => {
            if (sc.steps)
                sc.steps.forEach(st => this.normalizeStepBranches(st));
        });
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
                    sc.steps.forEach(st => this.normalizeStepBranches(st));
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
                this.advance(step);
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
                this.finishStep(step, step.gapMs);
            };
            // Watchdog: generous enough not to cut real speech short
            // (~90ms/char, clamped to 6s..60s), but bounded so a hung engine
            // can never stall the scenario.
            let watchdogMs = Math.min(60000, Math.max(6000, text.length * 90));
            clearTimeout(this.watchdog);
            this.watchdog = window.setTimeout(() => {
                this.finishStep(step, step.gapMs);
            }, watchdogMs);
            RAG.speech.speak(phraseEl);
        }
        else {
            this.stepFinished = false;
            this.timer = window.setTimeout(() => {
                this.advance(step);
            }, step.gapMs || 1500);
        }
    }
    /**
     * Completes the current step exactly once, whether it ended because the
     * speech engine signalled completion or because the watchdog fired. Safe
     * against the re-entrant onstop that speech.stop() can trigger: the
     * stepFinished guard is set before speech is stopped.
     */
    finishStep(step, gapMs) {
        if (this.stepFinished)
            return;
        this.stepFinished = true;
        clearTimeout(this.watchdog);
        if (typeof RAG !== 'undefined' && RAG.speech)
            RAG.speech.stop();
        this.timer = window.setTimeout(() => {
            this.advance(step);
        }, gapMs || 0);
    }
    advance(step) {
        if (!this.running)
            return;
        // "Play one step" mode: this step was the only one asked for, so
        // finish the run here (branches deliberately do not fire).
        if (this.stopAfterStep) {
            this.stopAfterStep = false;
            this.running = false;
            this.paused = false;
            this.broadcast('STOP_PLAYBACK');
            if (this.onComplete)
                this.onComplete();
            return;
        }
        // Ordered branches (if / elif / else): the first branch whose
        // condition matches wins and jumps to its target; when none match the
        // run falls through to the next step.
        let branches = [];
        if (step.branches && step.branches.length > 0)
            branches = step.branches;
        else if (step.branch)
            branches = [step.branch];
        for (let k = 0; k < branches.length; k++) {
            if (this.evalBranch(branches[k]) && this.jumpTo(branches[k].target))
                return;
        }
        this.currentIndex++;
        this.runStep();
    }
    /**
     * Jumps the run to a branch target ('end', an index, or a label).
     * Returns true if the jump landed; an unusable target (wrong type) makes
     * the caller fall through to the next step instead (no stall). A label
     * that matches no step goes to the end of the scenario.
     */
    jumpTo(target) {
        if (target === 'end') {
            this.currentIndex = this.steps.length;
            this.runStep();
            return true;
        }
        if (typeof target === 'string') {
            let idx = this.steps.findIndex(s => s.label === target);
            this.currentIndex = idx >= 0 ? idx : this.steps.length;
            this.runStep();
            return true;
        }
        if (typeof target === 'number') {
            this.currentIndex = Math.max(0, Math.min(target, this.steps.length));
            this.runStep();
            return true;
        }
        return false;
    }
    evalBranch(b) {
        if (!b)
            return false;
        if (typeof RAG === 'undefined' || !RAG.state)
            return false;
        switch (b.condition) {
            case 'delay':
                try {
                    let d = RAG.state.getInteger('delayed');
                    return d >= Scenario.numThreshold(b.threshold, 0);
                }
                catch (_a) {
                    return false;
                }
            case 'random':
                {
                    // Legacy probability wins; threshold is its modern replacement
                    let pct = 50;
                    if (b.probability !== undefined)
                        pct = b.probability;
                    else if (b.threshold !== undefined)
                        pct = Scenario.numThreshold(b.threshold, 50);
                    return Math.random() * 100 < pct;
                }
            case 'time':
                {
                    let hour = Scenario.numThreshold(b.threshold, -1);
                    if (hour < 0)
                        return false;
                    try {
                        let t = RAG.state.getTime('main');
                        let h = parseInt(t.split(':')[0], 10);
                        return h >= hour;
                    }
                    catch (_b) {
                        return false;
                    }
                }
            case 'platform':
                try {
                    let platStr = RAG.state.platform[0] + RAG.state.platform[1];
                    return platStr.trim() === String(b.threshold || '').trim();
                }
                catch (_c) {
                    return false;
                }
            case 'service':
                try {
                    return RAG.state.getService('provider').toLowerCase().indexOf(String(b.threshold || '').toLowerCase()) !== -1;
                }
                catch (_d) {
                    return false;
                }
            default:
                return false;
        }
    }
    /** Broadcast a playback event to the other tabs (the editor mirrors it, display-only) */
    broadcast(type, payload) {
        if (typeof RAG !== 'undefined' && RAG.channel)
            RAG.channel.send(type, payload || {});
    }
    /** Coerces a threshold (number or numeric string) to a number, else the fallback */
    static numThreshold(value, fallback) {
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string') {
            let n = parseFloat(value);
            if (!isNaN(n))
                return n;
        }
        return fallback;
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
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
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
/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */
/**
 * Controller for the top toolbar.
 *
 * The toolbar differs per page: the editor page (index.html) has no run button
 * because playback is controlled from the dashboard; the dashboard page
 * (dashboard.html) runs scenarios from its own panel. Buttons that are not
 * present on a given page are looked up optionally and simply not wired.
 */
class Toolbar {
    constructor() {
        this.dom = DOM.require('#toolbar');
        this.btnPlay = Toolbar.optional('#btnPlay');
        this.btnStop = Toolbar.optional('#btnStop');
        this.btnGenerate = DOM.require('#btnShuffle');
        this.btnSave = DOM.require('#btnSave');
        this.btnRecall = DOM.require('#btnLoad');
        this.btnOption = DOM.require('#btnSettings');
        this.btnDashboard = Toolbar.optional('#btnDashboard');
        this.btnScenario = DOM.require('#btnScenario');
        this.btnUpdateStep = Toolbar.optional('#btnUpdateStep');
        if (this.btnPlay)
            this.btnPlay.onclick = this.handlePlay.bind(this);
        if (this.btnStop)
            this.btnStop.onclick = this.handleStop.bind(this);
        this.btnGenerate.onclick = this.handleGenerate.bind(this);
        this.btnSave.onclick = this.handleSave.bind(this);
        this.btnRecall.onclick = this.handleLoad.bind(this);
        this.btnOption.onclick = this.handleOption.bind(this);
        if (this.btnDashboard)
            this.btnDashboard.onclick = () => window.open('index.html?dashboard=1', '_blank');
        this.btnScenario.onclick = this.handleCaptureStep.bind(this);
        if (this.btnUpdateStep)
            this.btnUpdateStep.onclick = this.handleUpdateStep.bind(this);
        if (!RAG.config.clickedGenerate) {
            this.btnGenerate.classList.add('throb');
            this.btnGenerate.focus();
        }
        else if (this.btnPlay)
            this.btnPlay.focus();
    }
    /** Looks up a toolbar button that is legitimately absent on some pages */
    static optional(sel) {
        return document.querySelector(sel) || null;
    }
    /** Plays the current announcement through the speech engine */
    handlePlay() {
        RAG.speech.stop();
        if (this.btnPlay)
            this.btnPlay.disabled = true;
        window.setTimeout(this.handlePlay2.bind(this), 200);
    }
    handlePlay2() {
        let hasSpoken = false;
        let speechText = RAG.views.editor.getText();
        if (this.btnPlay) {
            this.btnPlay.hidden = true;
            this.btnPlay.disabled = false;
        }
        if (this.btnStop)
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
        if (this.btnStop)
            this.btnStop.focus();
    }
    handleStop(ev) {
        RAG.speech.onspeak = undefined;
        RAG.speech.onstop = undefined;
        if (this.btnPlay)
            this.btnPlay.hidden = false;
        if (this.btnStop && this.btnPlay && document.activeElement === this.btnStop)
            this.btnPlay.focus();
        if (this.btnStop)
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
    handleSave() { RAG.views.statePicker.open('save'); }
    handleLoad() { RAG.views.statePicker.open('load'); }
    handleOption() { RAG.views.settings.open(); }
    /**
     * Captures the current announcement as a new step in the active scenario.
     * The active scenario lives in localStorage (shared with the dashboard);
     * if none is active yet, a fresh one is created and made active.
     */
    handleCaptureStep() {
        let raw = localStorage.getItem('rag.scenarios');
        let scenarios = raw ? JSON.parse(raw) : [];
        let id = localStorage.getItem('rag.currentScenarioId');
        let sc = scenarios.find((s) => s.id === id);
        if (!sc) {
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
        if (RAG.dashboard)
            RAG.dashboard.refresh();
        RAG.views.marquee.set('Updated step ' + (idx + 1) + ' in "' + sc.name + '"');
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
        // Begin
        RAG.views.disclaimer.disclaim();
        RAG.views.marquee.set(L.WELCOME);
        RAG.generate();
        // Ping dashboard if open
        RAG.channel.send('PONG', { stateJson: JSON.stringify(RAG.state) });
        // Determine this page's role. The dashboard role is the controller
        // (build / manage / run); the editor role is the main page (display +
        // step editing). Both are the same app, distinguished by the URL.
        if (RAG.isDashboardRole())
            RAG.dashboard.open();
        else {
            RAG.applyEditRequest();
            RAG.bindPlaybackGate();
        }
    }
    /** True when this page was opened as the dashboard (controller) view */
    static isDashboardRole() {
        let search = window.location.search || '';
        let hash = window.location.hash || '';
        return search.indexOf('dashboard=1') !== -1 || hash.indexOf('dashboard') !== -1;
    }
    /**
     * Editor role: if the dashboard asked to edit a specific step, load that
     * step's announcement into the editor and point "Update Step" at it.
     */
    static applyEditRequest() {
        if (window.localStorage.getItem('rag.editRequest') !== '1')
            return;
        window.localStorage.removeItem('rag.editRequest');
        let id = window.localStorage.getItem('rag.currentScenarioId');
        let idxStr = window.localStorage.getItem('rag.selectedStepIndex');
        if (!id || idxStr === null)
            return;
        let idx = parseInt(idxStr);
        let raw = window.localStorage.getItem('rag.scenarios');
        if (!raw)
            return;
        let scenarios = JSON.parse(raw);
        let sc = scenarios.find(s => s.id === id);
        let step = (sc && sc.steps[idx]) ? sc.steps[idx] : null;
        if (!step || !step.stateJson)
            return;
        RAG.load(step.stateJson);
        RAG.views.marquee.set('Editing step ' + (idx + 1) + ' of "' + sc.name + '". Make your changes, then click "Update Step" to save them back.');
    }
    /**
     * Editor role: pause editing while a scenario is playing in another tab.
     * The dashboard tab sets rag.playbackActive; we react to it live.
     */
    static bindPlaybackGate() {
        let apply = (active) => {
            if (!RAG.views)
                return;
            RAG.views.main.style.pointerEvents = active ? 'none' : '';
            let toolbar = document.getElementById('toolbar');
            if (toolbar)
                toolbar.style.pointerEvents = active ? 'none' : '';
        };
        let check = () => {
            let active = window.localStorage.getItem('rag.playbackActive') === '1';
            if (active) {
                // The dashboard tab refreshes this heartbeat while it is
                // alive; a stale stamp means it closed (or crashed) mid-
                // playback, so release the lock instead of holding the
                // editor hostage forever.
                let since = parseInt(window.localStorage.getItem('rag.playbackSince') || '0', 10);
                if (Date.now() - since > 15 * 1000) {
                    window.localStorage.removeItem('rag.playbackActive');
                    window.localStorage.removeItem('rag.playbackSince');
                    active = false;
                }
            }
            apply(active);
        };
        check();
        window.addEventListener('storage', (e) => {
            if (e.key === 'rag.playbackActive' || e.key === 'rag.playbackSince')
                check();
        });
        // Storage events only fire on a write; a dead dashboard tab stops
        // writing, so also re-check on a timer to catch a stale lock.
        window.setInterval(check, 5 * 1000);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL2NvbGxhcHNlVG9nZ2xlLnRzIiwidWkvY29udHJvbHMvcGhyYXNlc2V0QnV0dG9uLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkNob29zZXIudHMiLCJ1aS9jb250cm9scy9zdGF0aW9uTGlzdEl0ZW0udHMiLCJ1aS9waWNrZXJzL3BpY2tlci50cyIsInVpL3BpY2tlcnMvY29hY2hQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2V4Y3VzZVBpY2tlci50cyIsInVpL3BpY2tlcnMvaW50ZWdlclBpY2tlci50cyIsInVpL3BpY2tlcnMvbmFtZWRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BocmFzZXNldFBpY2tlci50cyIsInVpL3BpY2tlcnMvcGxhdGZvcm1QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3NlcnZpY2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25MaXN0UGlja2VyLnRzIiwidWkvcGlja2Vycy90aW1lUGlja2VyLnRzIiwiY29uZmlnL2NvbmZpZ0Jhc2UudHMiLCJjb25maWcvY29uZmlnLnRzIiwiZGFzaGJvYXJkL2Rhc2hib2FyZC50cyIsImxhbmcvZW5nbGlzaExhbmd1YWdlLnRzIiwicGhyYXNlci9lbGVtZW50UHJvY2Vzc29ycy50cyIsInBocmFzZXIvcGhyYXNlQ29udGV4dC50cyIsInBocmFzZXIvcGhyYXNlci50cyIsInNjZW5hcmlvL3NjZW5hcmlvLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL3ZpZXdCYXNlLnRzIiwidWkvZGlzY2xhaW1lci50cyIsInVpL2VkaXRvci50cyIsInVpL21hcnF1ZWUudHMiLCJ1aS9zZXR0aW5ncy50cyIsInVpL3N0YXRlUGlja2VyLnRzIiwidWkvdG9vbGJhci50cyIsInVpL3ZpZXdzLnRzIiwidXRpbC9hc3NlcnRzLnRzIiwidXRpbC9jb2xsYXBzaWJsZXMudHMiLCJ1dGlsL2NvbmRpdGlvbmFscy50cyIsInV0aWwvZG9tLnRzIiwidXRpbC9saW5rZG93bi50cyIsInV0aWwvcGFyc2UudHMiLCJ1dGlsL3JhbmRvbS50cyIsInV0aWwvc291bmRzLnRzIiwidXRpbC9zdHJpbmdzLnRzIiwidXRpbC90eXBlcy50cyIsImNoYW5uZWwudHMiLCJkYXRhYmFzZS50cyIsInJhZy50cyIsInN0YXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLHNFQUFzRTtBQUV0RSw4REFBOEQ7QUFDOUQsSUFBSSxDQUFtQixDQUFDO0FBRXhCLE1BQU0sSUFBSTtJQVVOLDRFQUE0RTtJQUNyRSxNQUFNLENBQUMsSUFBSTtRQUVkLElBQUksSUFBSSxDQUFDLFNBQVM7WUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDLFNBQVMsR0FBRztZQUNiLElBQUksRUFBRyxJQUFJLGVBQWUsRUFBRTtTQUMvQixDQUFDO1FBRUYsMkJBQTJCO1FBQzNCLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFNUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssTUFBTSxDQUFDLFVBQVU7UUFFckIsSUFBSSxJQUFrQixDQUFDO1FBQ3ZCLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FDaEMsUUFBUSxDQUFDLElBQUksRUFDYixVQUFVLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxTQUFTLEVBQzlDLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUs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QUFJLE9BQU8sR0FBRyxJQUFJLElBQUksQ0FBRSxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFFMUUsSUFBSSxDQUFDLE9BQU8sQ0FBRSxNQUFNLEVBQVMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBSyxDQUFDO1FBQ3pELElBQUksQ0FBQyxPQUFPLENBQUUsYUFBYSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUUsQ0FBQztJQUM3RCxDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogR2xvYmFsIHJlZmVyZW5jZSB0byB0aGUgbGFuZ3VhZ2UgY29udGFpbmVyLCBzZXQgYXQgaW5pdCAqL1xyXG5sZXQgTCA6IEVuZ2xpc2hMYW5ndWFnZTtcclxuXHJcbmNsYXNzIEkxOG5cclxue1xyXG4gICAgLyoqIENvbnN0YW50IHJlZ2V4IHRvIG1hdGNoIGZvciB0cmFuc2xhdGlvbiBrZXlzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBUQUdfUkVHRVggOiBSZWdFeHAgPSAvJVtBLVpfXSslLztcclxuXHJcbiAgICAvKiogTGFuZ3VhZ2VzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGxhbmd1YWdlcyAgIDogRGljdGlvbmFyeTxFbmdsaXNoTGFuZ3VhZ2U+O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBsYW5ndWFnZSBjdXJyZW50bHkgaW4gdXNlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBjdXJyZW50TGFuZyA6IEVuZ2xpc2hMYW5ndWFnZTtcclxuXHJcbiAgICAvKiogUGlja3MgYSBsYW5ndWFnZSwgYW5kIHRyYW5zZm9ybXMgYWxsIHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGRvY3VtZW50ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5sYW5ndWFnZXMpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSTE4biBpcyBhbHJlYWR5IGluaXRpYWxpemVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMubGFuZ3VhZ2VzID0ge1xyXG4gICAgICAgICAgICAnZW4nIDogbmV3IEVuZ2xpc2hMYW5ndWFnZSgpXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTGFuZ3VhZ2Ugc2VsZWN0aW9uXHJcbiAgICAgICAgTCA9IHRoaXMuY3VycmVudExhbmcgPSB0aGlzLmxhbmd1YWdlc1snZW4nXTtcclxuXHJcbiAgICAgICAgSTE4bi5hcHBseVRvRG9tKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXYWxrcyB0aHJvdWdoIGFsbCB0ZXh0IG5vZGVzIGluIHRoZSBET00sIHJlcGxhY2luZyBhbnkgdHJhbnNsYXRpb24ga2V5cy5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMDczMDc3Ny8zMzU0OTIwXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGFwcGx5VG9Eb20oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV4dCA6IE5vZGUgfCBudWxsO1xyXG4gICAgICAgIGxldCB3YWxrID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keSxcclxuICAgICAgICAgICAgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQgfCBOb2RlRmlsdGVyLlNIT1dfVEVYVCxcclxuICAgICAgICAgICAgeyBhY2NlcHROb2RlOiBJMThuLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIG5leHQgPSB3YWxrLm5leHROb2RlKCkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5leHQgYXMgRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuYXR0cmlidXRlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgICAgICAgICBJMThuLmV4cGFuZEF0dHJpYnV0ZShlbGVtZW50LmF0dHJpYnV0ZXNbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIG5leHQudGV4dENvbnRlbnQpXHJcbiAgICAgICAgICAgICAgICBJMThuLmV4cGFuZFRleHROb2RlKG5leHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsdGVycyB0aGUgdHJlZSB3YWxrZXIgdG8gZXhjbHVkZSBzY3JpcHQgYW5kIHN0eWxlIHRhZ3MgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFnID0gKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICA/IChub2RlIGFzIEVsZW1lbnQpLnRhZ05hbWUudG9VcHBlckNhc2UoKVxyXG4gICAgICAgICAgICA6IG5vZGUucGFyZW50RWxlbWVudCEudGFnTmFtZS50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgICAgICByZXR1cm4gWydTQ1JJUFQnLCAnU1RZTEUnXS5pbmNsdWRlcyh0YWcpXHJcbiAgICAgICAgICAgID8gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUXHJcbiAgICAgICAgICAgIDogTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiBhdHRyaWJ1dGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZEF0dHJpYnV0ZShhdHRyOiBBdHRyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTZXR0aW5nIGFuIGF0dHJpYnV0ZSwgZXZlbiBpZiBub3RoaW5nIGFjdHVhbGx5IGNoYW5nZXMsIHdpbGwgY2F1c2UgdmFyaW91c1xyXG4gICAgICAgIC8vIHNpZGUtZWZmZWN0cyAoZS5nLiByZWxvYWRpbmcgaWZyYW1lcykuIFNvLCBhcyB3YXN0ZWZ1bCBhcyB0aGlzIGxvb2tzLCB3ZSBoYXZlXHJcbiAgICAgICAgLy8gdG8gbWF0Y2ggZmlyc3QgYmVmb3JlIGFjdHVhbGx5IHJlcGxhY2luZy5cclxuXHJcbiAgICAgICAgaWYgKCBhdHRyLnZhbHVlLm1hdGNoKHRoaXMuVEFHX1JFR0VYKSApXHJcbiAgICAgICAgICAgIGF0dHIudmFsdWUgPSBhdHRyLnZhbHVlLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEV4cGFuZHMgYW55IHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGdpdmVuIHRleHQgbm9kZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZXhwYW5kVGV4dE5vZGUobm9kZTogTm9kZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbm9kZS50ZXh0Q29udGVudCA9IG5vZGUudGV4dENvbnRlbnQhLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcGxhY2VzIGtleSB3aXRoIHZhbHVlIGlmIGl0IGV4aXN0cywgZWxzZSBrZWVwcyB0aGUga2V5ICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXBsYWNlKG1hdGNoOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgID0gbWF0Y2guc2xpY2UoMSwgLTEpO1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IExba2V5XSBhcyBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgICAgICBpZiAoIXZhbHVlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignTWlzc2luZyB0cmFuc2xhdGlvbiBrZXk6JywgbWF0Y2gpO1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgcmV0dXJuICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpXHJcbiAgICAgICAgICAgID8gdmFsdWUoKVxyXG4gICAgICAgICAgICA6IHZhbHVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIERlbGVnYXRlIHR5cGUgZm9yIGNob29zZXIgc2VsZWN0IGV2ZW50IGhhbmRsZXJzICovXHJcbnR5cGUgU2VsZWN0RGVsZWdhdGUgPSAoZW50cnk6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xyXG5cclxuLyoqIFVJIGVsZW1lbnQgd2l0aCBhIGZpbHRlcmFibGUgYW5kIGtleWJvYXJkIG5hdmlnYWJsZSBsaXN0IG9mIGNob2ljZXMgKi9cclxuY2xhc3MgQ2hvb3NlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gdGVtcGxhdGUgdG8gY2xvbmUsIGZvciBlYWNoIGNob29zZXIgY3JlYXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNjaG9vc2VyVGVtcGxhdGUnKTtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLmlkICAgICA9ICcnO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGNvbnRhaW5lciAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRvbSAgICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBmaWx0ZXIgaW5wdXQgYm94ICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5wdXRGaWx0ZXIgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgY29udGFpbmVyIG9mIGl0ZW0gZWxlbWVudHMgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnB1dENob2ljZXMgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogT3B0aW9uYWwgZXZlbnQgaGFuZGxlciB0byBmaXJlIHdoZW4gYW4gaXRlbSBpcyBzZWxlY3RlZCBieSB0aGUgdXNlciAqL1xyXG4gICAgcHVibGljICAgIG9uU2VsZWN0PyAgICAgOiBTZWxlY3REZWxlZ2F0ZTtcclxuICAgIC8qKiBXaGV0aGVyIHRvIHZpc3VhbGx5IHNlbGVjdCB0aGUgY2xpY2tlZCBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgICAgc2VsZWN0T25DbGljayA6IGJvb2xlYW4gPSB0cnVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGl0ZW0sIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIGRvbVNlbGVjdGVkPyAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGF1dG8tZmlsdGVyIHRpbWVvdXQsIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIGZpbHRlclRpbWVvdXQgOiBudW1iZXIgPSAwO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gZ3JvdXAgYWRkZWQgZWxlbWVudHMgYnkgYWxwaGFiZXRpY2FsIHNlY3Rpb25zICovXHJcbiAgICBwcm90ZWN0ZWQgZ3JvdXBCeUFCQyAgICA6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIC8qKiBUaXRsZSBhdHRyaWJ1dGUgdG8gYXBwbHkgdG8gZXZlcnkgaXRlbSBhZGRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGl0ZW1UaXRsZSAgICAgOiBzdHJpbmcgPSAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgaXRlbSc7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYSBjaG9vc2VyLCBieSByZXBsYWNpbmcgdGhlIHBsYWNlaG9sZGVyIGluIGEgZ2l2ZW4gcGFyZW50ICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBpZiAoIUNob29zZXIuVEVNUExBVEUpXHJcbiAgICAgICAgICAgIENob29zZXIuaW5pdCgpO1xyXG5cclxuICAgICAgICBsZXQgdGFyZ2V0ICAgICAgPSBET00ucmVxdWlyZSgnY2hvb3NlcicsIHBhcmVudCk7XHJcbiAgICAgICAgbGV0IHBsYWNlaG9sZGVyID0gRE9NLmdldEF0dHIodGFyZ2V0LCAncGxhY2Vob2xkZXInLCBMLlBfR0VORVJJQ19QSCk7XHJcbiAgICAgICAgbGV0IHRpdGxlICAgICAgID0gRE9NLmdldEF0dHIodGFyZ2V0LCAndGl0bGUnLCBMLlBfR0VORVJJQ19UKTtcclxuICAgICAgICB0aGlzLml0ZW1UaXRsZSAgPSBET00uZ2V0QXR0cih0YXJnZXQsICdpdGVtVGl0bGUnLCB0aGlzLml0ZW1UaXRsZSk7XHJcbiAgICAgICAgdGhpcy5ncm91cEJ5QUJDID0gdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnZ3JvdXBCeUFCQycpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICA9IENob29zZXIuVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIgID0gRE9NLnJlcXVpcmUoJy5jaFNlYXJjaEJveCcsICB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMgPSBET00ucmVxdWlyZSgnLmNoQ2hvaWNlc0JveCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGl0bGUgICAgICA9IHRpdGxlO1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIucGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcclxuICAgICAgICAvLyBUT0RPOiBSZXVzaW5nIHRoZSBwbGFjZWhvbGRlciBhcyB0aXRsZSBpcyBwcm9iYWJseSBiYWRcclxuICAgICAgICAvLyBodHRwczovL2xha2VuLm5ldC9ibG9nL21vc3QtY29tbW9uLWExMXktbWlzdGFrZXMvXHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci50aXRsZSAgICAgICA9IHBsYWNlaG9sZGVyO1xyXG5cclxuICAgICAgICB0YXJnZXQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdiZWZvcmViZWdpbicsIHRoaXMuZG9tKTtcclxuICAgICAgICB0YXJnZXQucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIHRoZSBnaXZlbiB2YWx1ZSB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVGV4dCBvZiB0aGUgc2VsZWN0YWJsZSBpdGVtXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFdoZXRoZXIgdG8gc2VsZWN0IHRoaXMgaXRlbSBvbmNlIGFkZGVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGQodmFsdWU6IHN0cmluZywgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgaXRlbS5pbm5lclRleHQgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgdGhpcy5hZGRSYXcoaXRlbSwgc2VsZWN0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIGVsZW1lbnQgdG8gdGhlIGNob29zZXIgYXMgYSBzZWxlY3RhYmxlIGl0ZW0uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGl0ZW0gRWxlbWVudCB0byBhZGQgdG8gdGhlIGNob29zZXJcclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZFJhdyhpdGVtOiBIVE1MRWxlbWVudCwgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGl0ZW0udGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBpdGVtLnRhYkluZGV4ID0gLTE7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmFwcGVuZENoaWxkKGl0ZW0pO1xyXG5cclxuICAgICAgICBpZiAoc2VsZWN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbGwgaXRlbXMgZnJvbSB0aGlzIGNob29zZXIgYW5kIHRoZSBjdXJyZW50IGZpbHRlciAqL1xyXG4gICAgcHVibGljIGNsZWFyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci52YWx1ZSAgICAgID0gJyc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNlbGVjdCBhbmQgZm9jdXMgdGhlIGVudHJ5IHRoYXQgbWF0Y2hlcyB0aGUgZ2l2ZW4gdmFsdWUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3QodmFsdWU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQga2V5IGluIHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGl0ZW0gPSB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbltrZXldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBpdGVtLmlubmVyVGV4dClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgICAgICBpdGVtLmZvY3VzKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbGljayBldmVudHMsIGZvciBjaG9vc2luZyBpdGVtcyAqL1xyXG4gICAgcHVibGljIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggdGhpcy5pc0Nob2ljZSh0YXJnZXQpIClcclxuICAgICAgICBpZiAoICF0YXJnZXQuaGFzQXR0cmlidXRlKCdkaXNhYmxlZCcpIClcclxuICAgICAgICAgICAgdGhpcy5zZWxlY3QodGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbG9zZSBtZXRob2RzLCBkb2luZyBhbnkgdGltZXIgY2xlYW51cCAqL1xyXG4gICAgcHVibGljIG9uQ2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgaW5wdXQgZXZlbnRzLCBmb3IgZmlsdGVyaW5nIGFuZCBuYXZpZ2F0aW9uICovXHJcbiAgICBwdWJsaWMgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBldi5rZXk7XHJcbiAgICAgICAgbGV0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gZm9jdXNlZC5wYXJlbnRFbGVtZW50ITtcclxuXHJcbiAgICAgICAgaWYgKCFmb2N1c2VkKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIGV2ZW50cyBvbiB0aGlzIGNob29zZXIncyBjb250cm9sc1xyXG4gICAgICAgIGlmICggIXRoaXMub3ducyhmb2N1c2VkKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHR5cGluZyBpbnRvIGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCA9PT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyVGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KF8gPT4gdGhpcy5maWx0ZXIoKSwgNTAwKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUmVkaXJlY3QgdHlwaW5nIHRvIGlucHV0IGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCAhPT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICBpZiAoa2V5Lmxlbmd0aCA9PT0gMSB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pbnB1dEZpbHRlci5mb2N1cygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcHJlc3NpbmcgRU5URVIgYWZ0ZXIga2V5Ym9hcmQgbmF2aWdhdGluZyB0byBhbiBpdGVtXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKGZvY3VzZWQpIClcclxuICAgICAgICBpZiAoa2V5ID09PSAnRW50ZXInKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3QoZm9jdXNlZCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBuYXZpZ2F0aW9uIHdoZW4gY29udGFpbmVyIG9yIGl0ZW0gaXMgZm9jdXNlZFxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd0xlZnQnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGRpciA9IChrZXkgPT09ICdBcnJvd0xlZnQnKSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IG5hdiA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiB1c2luZyBncm91cHNcclxuICAgICAgICAgICAgaWYgICAgICAoIHRoaXMuZ3JvdXBCeUFCQyAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdncm91cCcpIClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgaWYgY2hvaWNlcyBhcmUgZmxhdFxyXG4gICAgICAgICAgICBlbHNlIGlmICghdGhpcy5ncm91cEJ5QUJDICYmIGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dENob2ljZXMpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGZvY3VzZWQgPT09IHRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcodGhpcy5kb21TZWxlY3RlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGV2YW50IHRvIGJlZ2lubmluZyBvciBlbmQgb2YgY29udGFpbmVyXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA9PT0gLTEpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQubGFzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChuYXYpIG5hdi5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBzdWJtaXQgZXZlbnRzLCBmb3IgaW5zdGFudCBmaWx0ZXJpbmcgKi9cclxuICAgIHB1YmxpYyBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGlkZSBvciBzaG93IGNob2ljZXMgaWYgdGhleSBwYXJ0aWFsbHkgbWF0Y2ggdGhlIHVzZXIgcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcblxyXG4gICAgICAgIGxldCBmaWx0ZXIgPSB0aGlzLmlucHV0RmlsdGVyLnZhbHVlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgbGV0IGl0ZW1zICA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBlbmdpbmUgPSB0aGlzLmdyb3VwQnlBQkNcclxuICAgICAgICAgICAgPyBDaG9vc2VyLmZpbHRlckdyb3VwXHJcbiAgICAgICAgICAgIDogQ2hvb3Nlci5maWx0ZXJJdGVtO1xyXG5cclxuICAgICAgICAvLyBQcmV2ZW50IGJyb3dzZXIgcmVkcmF3L3JlZmxvdyBkdXJpbmcgZmlsdGVyaW5nXHJcbiAgICAgICAgLy8gVE9ETzogTWlnaHQgdGhlIHVzZSBvZiBoaWRkZW4gYnJlYWsgQTExeSBoZXJlPyAoZS5nLiBkZWZvY3VzKVxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmhpZGRlbiA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBhbGwgdGhlIGl0ZW1zXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgZW5naW5lKGl0ZW1zW2ldIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5oaWRkZW4gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gYW4gaXRlbSwgc2hvd2luZyBpdCBpZiBtYXRjaGVkLCBoaWRpbmcgaWYgbm90ICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGZpbHRlckl0ZW0oaXRlbTogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIC8vIFNob3cgaWYgY29udGFpbnMgc2VhcmNoIHRlcm1cclxuICAgICAgICBpZiAoaXRlbS5pbm5lclRleHQudG9Mb3dlckNhc2UoKS5pbmRleE9mKGZpbHRlcikgPj0gMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGlkZSBpZiBub3RcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpdGVtLmhpZGRlbiA9IHRydWU7XHJcbiAgICAgICAgICAgIHJldHVybiAxO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gY2hpbGRyZW4gb2YgYSBncm91cCwgaGlkaW5nIHRoZSBncm91cCBpZiBhbGwgY2hpbGRyZW4gaGlkZSAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBmaWx0ZXJHcm91cChncm91cDogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cmllcyA9IGdyb3VwLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBjb3VudCAgID0gZW50cmllcy5sZW5ndGggLSAxOyAvLyAtMSBmb3IgaGVhZGVyIGVsZW1lbnRcclxuICAgICAgICBsZXQgaGlkZGVuICA9IDA7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHN0YXRpb24gbmFtZSBpbiB0aGlzIGxldHRlciBzZWN0aW9uLiBIZWFkZXIgc2tpcHBlZC5cclxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGVudHJpZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIGhpZGRlbiArPSBDaG9vc2VyLmZpbHRlckl0ZW0oZW50cmllc1tpXSBhcyBIVE1MRWxlbWVudCwgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgLy8gSWYgYWxsIHN0YXRpb24gbmFtZXMgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbiB3ZXJlIGhpZGRlbiwgaGlkZSB0aGUgc2VjdGlvblxyXG4gICAgICAgIGlmIChoaWRkZW4gPj0gY291bnQpXHJcbiAgICAgICAgICAgIGdyb3VwLmhpZGRlbiA9IHRydWU7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBncm91cC5oaWRkZW4gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgY2hhbmdlcyB0aGUgY3VycmVudCBzZWxlY3Rpb24sIGFuZCB1cGRhdGVzIHRoZSBzdGF0ZSBhbmQgZWRpdG9yICovXHJcbiAgICBwcm90ZWN0ZWQgc2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGFscmVhZHlTZWxlY3RlZCA9IChlbnRyeSA9PT0gdGhpcy5kb21TZWxlY3RlZCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNlbGVjdE9uQ2xpY2spXHJcbiAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGVudHJ5KTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25TZWxlY3QpXHJcbiAgICAgICAgICAgIHRoaXMub25TZWxlY3QoZW50cnkpO1xyXG5cclxuICAgICAgICBpZiAoYWxyZWFkeVNlbGVjdGVkKVxyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IGNoYW5nZXMgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50ICovXHJcbiAgICBwcm90ZWN0ZWQgdmlzdWFsU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy52aXN1YWxVbnNlbGVjdCgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkICAgICAgICAgID0gZW50cnk7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC50YWJJbmRleCA9IDUwO1xyXG4gICAgICAgIGVudHJ5LnNldEF0dHJpYnV0ZSgnc2VsZWN0ZWQnLCAndHJ1ZScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSB1bnNlbGVjdHMgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50LCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCB2aXN1YWxVbnNlbGVjdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5kb21TZWxlY3RlZClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnJlbW92ZUF0dHJpYnV0ZSgnc2VsZWN0ZWQnKTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnRhYkluZGV4ID0gLTE7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZCAgICAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFdoZXRoZXIgdGhpcyBjaG9vc2VyIGlzIGFuIGFuY2VzdG9yIChvd25lcikgb2YgdGhlIGdpdmVuIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFbGVtZW50IHRvIGNoZWNrIGlmIHRoaXMgY2hvb3NlciBpcyBhbiBhbmNlc3RvciBvZlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb3ducyh0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uY29udGFpbnModGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogV2hldGhlciB0aGUgZ2l2ZW4gZWxlbWVudCBpcyBhIGNob29zYWJsZSBvbmUgb3duZWQgYnkgdGhpcyBjaG9vc2VyICovXHJcbiAgICBwcm90ZWN0ZWQgaXNDaG9pY2UodGFyZ2V0PzogSFRNTEVsZW1lbnQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0YXJnZXQgIT09IHVuZGVmaW5lZFxyXG4gICAgICAgICAgICAmJiB0YXJnZXQudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnZGQnXHJcbiAgICAgICAgICAgICYmIHRoaXMub3ducyh0YXJnZXQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFVJIGVsZW1lbnQgZm9yIHRvZ2dsaW5nIHRoZSBzdGF0ZSBvZiBjb2xsYXBzaWJsZSBlZGl0b3IgZWxlbWVudHMgKi9cclxuY2xhc3MgQ29sbGFwc2VUb2dnbGVcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdG9nZ2xlIGJ1dHRvbiBET00gdGVtcGxhdGUgdG8gY2xvbmUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI2NvbGxhcHNpYmxlQnV0dG9uVGVtcGxhdGUnKTtcclxuICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgYXR0YWNoZXMgdG9nZ2xlIGVsZW1lbnQgZm9yIHRvZ2dsaW5nIGNvbGxhcHNpYmxlcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjcmVhdGVBbmRBdHRhY2gocGFyZW50OiBFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTa2lwIGlmIGEgdG9nZ2xlIGlzIGFscmVhZHkgYXR0YWNoZWRcclxuICAgICAgICBpZiAoIHBhcmVudC5xdWVyeVNlbGVjdG9yKCcudG9nZ2xlJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICghQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUpXHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLmluaXQoKTtcclxuXHJcbiAgICAgICAgcGFyZW50Lmluc2VydEFkamFjZW50RWxlbWVudCgnYWZ0ZXJiZWdpbicsXHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBFbGVtZW50XHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgZ2l2ZW4gY29sbGFwc2UgdG9nZ2xlJ3MgdGl0bGUgdGV4dCwgZGVwZW5kaW5nIG9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHVwZGF0ZShzcGFuOiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICA9IHNwYW4uZGF0YXNldFsncmVmJ10gfHwgJz8/Pyc7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHNwYW4uZGF0YXNldFsndHlwZSddITtcclxuICAgICAgICBsZXQgc3RhdGUgID0gc3Bhbi5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG4gICAgICAgIGxldCB0b2dnbGUgPSBET00ucmVxdWlyZSgnLnRvZ2dsZScsIHNwYW4pO1xyXG5cclxuICAgICAgICB0b2dnbGUudGl0bGUgPSBzdGF0ZVxyXG4gICAgICAgICAgICA/IEwuVElUTEVfT1BUX09QRU4odHlwZSwgcmVmKVxyXG4gICAgICAgICAgICA6IEwuVElUTEVfT1BUX0NMT1NFKHR5cGUsIHJlZik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVUkgZWxlbWVudCBmb3Igb3BlbmluZyB0aGUgcGlja2VyIGZvciBwaHJhc2VzZXQgZWRpdG9yIGVsZW1lbnRzICovXHJcbmNsYXNzIFBocmFzZXNldEJ1dHRvblxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2VzZXQgYnV0dG9uIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IFRoaXMgaXMgYmVpbmcgZHVwbGljYXRlZCBpbiB2YXJpb3VzIHBsYWNlczsgRFJZIHdpdGggc3VnYXIgbWV0aG9kXHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjcGhyYXNlc2V0QnV0dG9uVGVtcGxhdGUnKTtcclxuICAgICAgICBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIFBocmFzZXNldEJ1dHRvbi5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgYXR0YWNoZXMgYSBidXR0b24gZm9yIHRoZSBnaXZlbiBwaHJhc2VzZXQgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjcmVhdGVBbmRBdHRhY2gocGhyYXNlc2V0OiBFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTa2lwIGlmIGEgYnV0dG9uIGlzIGFscmVhZHkgYXR0YWNoZWRcclxuICAgICAgICBpZiAoIHBocmFzZXNldC5xdWVyeVNlbGVjdG9yKCcuY2hvb3NlUGhyYXNlJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICghUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBQaHJhc2VzZXRCdXR0b24uaW5pdCgpO1xyXG5cclxuICAgICAgICBsZXQgcmVmICAgICAgPSBET00ucmVxdWlyZURhdGEocGhyYXNlc2V0IGFzIEhUTUxFbGVtZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IGJ1dHRvbiAgID0gUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBidXR0b24udGl0bGUgPSBMLlRJVExFX1BIUkFTRVNFVChyZWYpO1xyXG5cclxuICAgICAgICBwaHJhc2VzZXQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmJlZ2luJywgYnV0dG9uKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLzxyZWZlcmVuY2UgcGF0aD1cImNob29zZXIudHNcIi8+XHJcblxyXG4vLyBUT0RPOiBTZWFyY2ggYnkgc3RhdGlvbiBjb2RlXHJcblxyXG4vKipcclxuICogU2luZ2xldG9uIGluc3RhbmNlIG9mIHRoZSBzdGF0aW9uIHBpY2tlci4gU2luY2UgdGhlcmUgYXJlIGV4cGVjdGVkIHRvIGJlIDI1MDArXHJcbiAqIHN0YXRpb25zLCB0aGlzIGVsZW1lbnQgd291bGQgdGFrZSB1cCBhIGxvdCBvZiBtZW1vcnkgYW5kIGdlbmVyYXRlIGEgbG90IG9mIERPTS4gU28sIGl0XHJcbiAqIGhhcyB0byBiZSBcInN3YXBwZWRcIiBiZXR3ZWVuIHBpY2tlcnMgYW5kIHZpZXdzIHRoYXQgd2FudCB0byB1c2UgaXQuXHJcbiAqL1xyXG5jbGFzcyBTdGF0aW9uQ2hvb3NlciBleHRlbmRzIENob29zZXJcclxue1xyXG4gICAgLyoqIFNob3J0Y3V0IHJlZmVyZW5jZXMgdG8gYWxsIHRoZSBnZW5lcmF0ZWQgQS1aIHN0YXRpb24gbGlzdCBlbGVtZW50cyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21TdGF0aW9ucyA6IERpY3Rpb25hcnk8SFRNTERMaXN0RWxlbWVudD4gPSB7fTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBzdXBlcihwYXJlbnQpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy50YWJJbmRleCA9IDA7XHJcblxyXG4gICAgICAgIC8vIFBvcHVsYXRlcyB0aGUgbGlzdCBvZiBzdGF0aW9ucyBmcm9tIHRoZSBkYXRhYmFzZS4gV2UgZG8gdGhpcyBieSBjcmVhdGluZyBhIGRsXHJcbiAgICAgICAgLy8gZWxlbWVudCBmb3IgZWFjaCBsZXR0ZXIgb2YgdGhlIGFscGhhYmV0LCBjcmVhdGluZyBhIGR0IGVsZW1lbnQgaGVhZGVyLCBhbmQgdGhlblxyXG4gICAgICAgIC8vIHBvcHVsYXRpbmcgdGhlIGRsIHdpdGggc3RhdGlvbiBuYW1lIGRkIGNoaWxkcmVuLlxyXG4gICAgICAgIE9iamVjdC5rZXlzKFJBRy5kYXRhYmFzZS5zdGF0aW9ucykuZm9yRWFjaCggdGhpcy5hZGRTdGF0aW9uLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEF0dGFjaGVzIHRoaXMgY29udHJvbCB0byB0aGUgZ2l2ZW4gcGFyZW50IGFuZCByZXNldHMgc29tZSBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGlja2VyIFBpY2tlciB0byBhdHRhY2ggdGhpcyBjb250cm9sIHRvXHJcbiAgICAgKiBAcGFyYW0gb25TZWxlY3QgRGVsZWdhdGUgdG8gZmlyZSB3aGVuIGNob29zaW5nIGEgc3RhdGlvblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYXR0YWNoKHBpY2tlcjogUGlja2VyLCBvblNlbGVjdDogU2VsZWN0RGVsZWdhdGUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gcGlja2VyLmRvbUZvcm07XHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSB0aGlzLmRvbS5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBSZS1lbmFibGUgYWxsIGRpc2FibGVkIGVsZW1lbnRzXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMucXVlcnlTZWxlY3RvckFsbChgZGRbZGlzYWJsZWRdYClcclxuICAgICAgICAgICAgLmZvckVhY2goIHRoaXMuZW5hYmxlLmJpbmQodGhpcykgKTtcclxuXHJcbiAgICAgICAgaWYgKCFjdXJyZW50IHx8IGN1cnJlbnQgIT09IHBhcmVudClcclxuICAgICAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy52aXN1YWxVbnNlbGVjdCgpO1xyXG4gICAgICAgIHRoaXMub25TZWxlY3QgPSBvblNlbGVjdC5iaW5kKHBpY2tlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFByZS1zZWxlY3RzIGEgc3RhdGlvbiBlbnRyeSBieSBpdHMgY29kZSAqL1xyXG4gICAgcHVibGljIHByZXNlbGVjdENvZGUoY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSB0aGlzLmdldEJ5Q29kZShjb2RlKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChlbnRyeSk7XHJcbiAgICAgICAgZW50cnkuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRW5hYmxlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlIG9yIHN0YXRpb24gZWxlbWVudCBmb3Igc2VsZWN0aW9uICovXHJcbiAgICBwdWJsaWMgZW5hYmxlKGNvZGVPck5vZGU6IHN0cmluZyB8IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSAodHlwZW9mIGNvZGVPck5vZGUgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICA/IHRoaXMuZ2V0QnlDb2RlKGNvZGVPck5vZGUpXHJcbiAgICAgICAgICAgIDogY29kZU9yTm9kZTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbnRyeS5yZW1vdmVBdHRyaWJ1dGUoJ2Rpc2FibGVkJyk7XHJcbiAgICAgICAgZW50cnkudGFiSW5kZXggPSAtMTtcclxuICAgICAgICBlbnRyeS50aXRsZSAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBEaXNhYmxlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlIGZyb20gc2VsZWN0aW9uICovXHJcbiAgICBwdWJsaWMgZGlzYWJsZShjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9IHRoaXMuZ2V0QnlDb2RlKGNvZGUpO1xyXG4gICAgICAgIGxldCBuZXh0ICA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhlbnRyeSwgMSk7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW50cnkuc2V0QXR0cmlidXRlKCdkaXNhYmxlZCcsICcnKTtcclxuICAgICAgICBlbnRyeS5yZW1vdmVBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XHJcbiAgICAgICAgZW50cnkudGl0bGUgPSAnJztcclxuXHJcbiAgICAgICAgLy8gU2hpZnQgZm9jdXMgdG8gbmV4dCBhdmFpbGFibGUgZWxlbWVudCwgZm9yIGtleWJvYXJkIG5hdmlnYXRpb25cclxuICAgICAgICBpZiAobmV4dClcclxuICAgICAgICAgICAgbmV4dC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIGEgc3RhdGlvbidzIGNob2ljZSBlbGVtZW50IGJ5IGl0cyBjb2RlICovXHJcbiAgICBwcml2YXRlIGdldEJ5Q29kZShjb2RlOiBzdHJpbmcpIDogSFRNTEVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbnB1dENob2ljZXNcclxuICAgICAgICAgICAgLnF1ZXJ5U2VsZWN0b3IoYGRkW2RhdGEtY29kZT0ke2NvZGV9XWApIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlICovXHJcbiAgICBwcml2YXRlIGFkZFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG4gICAgICAgIGxldCBsZXR0ZXIgID0gc3RhdGlvblswXTtcclxuICAgICAgICBsZXQgZ3JvdXAgICA9IHRoaXMuZG9tU3RhdGlvbnNbbGV0dGVyXTtcclxuXHJcbiAgICAgICAgaWYgKCFncm91cClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBoZWFkZXIgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkdCcpO1xyXG4gICAgICAgICAgICBoZWFkZXIuaW5uZXJUZXh0ID0gbGV0dGVyLnRvVXBwZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGhlYWRlci50YWJJbmRleCAgPSAtMTtcclxuXHJcbiAgICAgICAgICAgIGdyb3VwID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGwnKTtcclxuICAgICAgICAgICAgZ3JvdXAudGFiSW5kZXggPSA1MDtcclxuXHJcbiAgICAgICAgICAgIGdyb3VwLnNldEF0dHJpYnV0ZSgnZ3JvdXAnLCAnJyk7XHJcbiAgICAgICAgICAgIGdyb3VwLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmFwcGVuZENoaWxkKGdyb3VwKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlbnRyeSAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcbiAgICAgICAgZW50cnkuZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgICAgICBlbnRyeS5pbm5lclRleHQgICAgICAgPSBzdGF0aW9uO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlICAgICAgICAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgICAgIGVudHJ5LnRhYkluZGV4ICAgICAgICA9IC0xO1xyXG5cclxuICAgICAgICBncm91cC5hcHBlbmRDaGlsZChlbnRyeSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3RhdGlvbiBsaXN0IGl0ZW0gdGhhdCBjYW4gYmUgZHJhZ2dlZCBhbmQgZHJvcHBlZCAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdEl0ZW1cclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBpdGVtIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNzdGF0aW9uTGlzdEl0ZW1UZW1wbGF0ZScpO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBpdGVtJ3MgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHN0YXRpb24gbGlzdCBpdGVtLCBtZWFudCBmb3IgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gY3JlYXRlIHRoaXMgaXRlbSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGNvZGU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICBpZiAoIVN0YXRpb25MaXN0SXRlbS5URU1QTEFURSlcclxuICAgICAgICAgICAgU3RhdGlvbkxpc3RJdGVtLmluaXQoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICAgID0gU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICB0aGlzLmRvbS5pbm5lclRleHQgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBCYXNlIGNsYXNzIGZvciBwaWNrZXIgdmlld3MgKi9cclxuYWJzdHJhY3QgY2xhc3MgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbSAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGZvcm0gRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb21Gb3JtICAgOiBIVE1MRm9ybUVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgaGVhZGVyIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb21IZWFkZXIgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBuYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIGhhbmRsZXMgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSB4bWxUYWcgICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgYmVpbmcgZWRpdGVkIGJ5IHRoaXMgcGlja2VyICovXHJcbiAgICBwcm90ZWN0ZWQgZG9tRWRpdGluZz8gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBwaWNrZXIgdG8gaGFuZGxlIHRoZSBnaXZlbiBwaHJhc2UgZWxlbWVudCB0eXBlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB4bWxUYWcgTmFtZSBvZiB0aGUgWE1MIHRhZyB0aGlzIHBpY2tlciB3aWxsIGhhbmRsZS5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKHhtbFRhZzogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICAgID0gRE9NLnJlcXVpcmUoYCMke3htbFRhZ31QaWNrZXJgKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0gICA9IERPTS5yZXF1aXJlKCdmb3JtJywgICB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIgPSBET00ucmVxdWlyZSgnaGVhZGVyJywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMueG1sVGFnICAgID0geG1sVGFnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jaGFuZ2UgID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmlucHV0ICAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uY2xpY2sgICA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25zdWJtaXQgID0gdGhpcy5vblN1Ym1pdC5iaW5kKHRoaXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIHdoZW4gZm9ybSBmaWVsZHMgY2hhbmdlLiBUaGUgaW1wbGVtZW50aW5nIHBpY2tlciBzaG91bGQgdXBkYXRlIGFsbCBsaW5rZWRcclxuICAgICAqIGVsZW1lbnRzIChlLmcuIG9mIHNhbWUgdHlwZSkgd2l0aCB0aGUgbmV3IGRhdGEgaGVyZS5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2hhbmdlKGV2OiBFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiBhIG1vdXNlIGNsaWNrIGhhcHBlbnMgYW55d2hlcmUgaW4gb3Igb24gdGhlIHBpY2tlcidzIGZvcm0gKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEga2V5IGlzIHByZXNzZWQgd2hpbHN0IHRoZSBwaWNrZXIncyBmb3JtIGlzIGZvY3VzZWQgKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBFTlRFUiBpcyBwcmVzc2VkIHdoaWxzdCBhIGZvcm0gY29udHJvbCBvZiB0aGUgcGlja2VyIGlzIGZvY3VzZWQuXHJcbiAgICAgKiBCeSBkZWZhdWx0LCB0aGlzIHdpbGwgdHJpZ2dlciB0aGUgb25DaGFuZ2UgaGFuZGxlciBhbmQgY2xvc2UgdGhlIGRpYWxvZy5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB0aGlzLm9uQ2hhbmdlKGV2KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVuIHRoaXMgcGlja2VyIGZvciBhIGdpdmVuIHBocmFzZSBlbGVtZW50LiBUaGUgaW1wbGVtZW50aW5nIHBpY2tlciBzaG91bGQgZmlsbFxyXG4gICAgICogaXRzIGZvcm0gZWxlbWVudHMgd2l0aCBkYXRhIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUgYW5kIHRhcmdldGVkIGVsZW1lbnQgaGVyZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSB0YXJnZXQgUGhyYXNlIGVsZW1lbnQgdGhhdCB0aGlzIHBpY2tlciBpcyBiZWluZyBvcGVuZWQgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyA9IHRhcmdldDtcclxuICAgICAgICB0aGlzLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvc2l0aW9ucyB0aGlzIHBpY2tlciByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IHBocmFzZSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgbGF5b3V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldFJlY3QgPSB0aGlzLmRvbUVkaXRpbmcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgbGV0IGZ1bGxXaWR0aCAgPSB0aGlzLmRvbS5jbGFzc0xpc3QuY29udGFpbnMoJ2Z1bGxXaWR0aCcpO1xyXG4gICAgICAgIGxldCBpc01vZGFsICAgID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbCcpO1xyXG4gICAgICAgIGxldCBkb2NXICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aDtcclxuICAgICAgICBsZXQgZG9jSCAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0O1xyXG4gICAgICAgIGxldCBkaWFsb2dYICAgID0gKHRhcmdldFJlY3QubGVmdCAgIHwgMCkgLSA4O1xyXG4gICAgICAgIGxldCBkaWFsb2dZICAgID0gIHRhcmdldFJlY3QuYm90dG9tIHwgMDtcclxuICAgICAgICBsZXQgZGlhbG9nVyAgICA9ICh0YXJnZXRSZWN0LndpZHRoICB8IDApICsgMTY7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiBob3Jpem9udGFsbHkgb2ZmIHNjcmVlblxyXG4gICAgICAgIGlmICghZnVsbFdpZHRoICYmICFpc01vZGFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9yY2UgZnVsbCB3aWR0aCBvbiBtb2JpbGVcclxuICAgICAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggPSBgMTAwJWA7XHJcblxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCAgICA9IGBpbml0aWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLm1pbldpZHRoID0gYCR7ZGlhbG9nV31weGA7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGRpYWxvZ1ggKyB0aGlzLmRvbS5vZmZzZXRXaWR0aCA+IGRvY1cpXHJcbiAgICAgICAgICAgICAgICAgICAgZGlhbG9nWCA9ICh0YXJnZXRSZWN0LnJpZ2h0IHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRXaWR0aCArIDg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaWNrZXJzIHRoYXQgaW5zdGVhZCB0YWtlIHVwIHRoZSB3aG9sZSBkaXNwbGF5LiBDU1MgaXNuJ3QgdXNlZCBoZXJlLFxyXG4gICAgICAgIC8vIGJlY2F1c2UgcGVyY2VudGFnZS1iYXNlZCBsZWZ0L3RvcCBjYXVzZXMgc3VicGl4ZWwgaXNzdWVzIG9uIENocm9tZS5cclxuICAgICAgICBpZiAoaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1ggPSBET00uaXNNb2JpbGUgPyAwIDogKCAoZG9jVyAqIDAuMSkgLyAyICkgfCAwO1xyXG4gICAgICAgICAgICBkaWFsb2dZID0gRE9NLmlzTW9iaWxlID8gMCA6ICggKGRvY0ggKiAwLjEpIC8gMiApIHwgMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50XHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSA8IDApXHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgdmVydGljYWxseSBvZmYgc2NyZWVuXHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dZID0gKHRhcmdldFJlY3QudG9wIHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgKyAxO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYmVsb3cnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJyk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBzdGlsbCBvZmYtc2NyZWVuLCBjbGFtcCB0byBib3R0b21cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgKyB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgPiBkb2NIKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IGRvY0ggLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICAvLyBDbGFtcCB0byB0b3AgZWRnZSBvZiBkb2N1bWVudC4gTGlrZWx5IGhhcHBlbnMgaWYgdGFyZ2V0IGVsZW1lbnQgaXMgbGFyZ2UuXHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYWJvdmUnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS5sZWZ0ID0gKGZ1bGxXaWR0aCA/IDAgOiBkaWFsb2dYKSArICdweCc7XHJcbiAgICAgICAgdGhpcy5kb20uc3R5bGUudG9wICA9IGRpYWxvZ1kgKyAncHgnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXR1cm5zIHRydWUgaWYgYW4gZWxlbWVudCBpbiB0aGlzIHBpY2tlciBjdXJyZW50bHkgaGFzIGZvY3VzICovXHJcbiAgICBwdWJsaWMgaGFzRm9jdXMoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uY29udGFpbnMoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBjb2FjaCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIENvYWNoUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBsZXR0ZXIgZHJvcC1kb3duIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMZXR0ZXIgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IGNvYWNoIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdjb2FjaCcpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyID0gRE9NLnJlcXVpcmUoJ3NlbGVjdCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAyNjsgaSsrKVxyXG4gICAgICAgICAgICBET00uYWRkT3B0aW9uKHRoaXMuaW5wdXRMZXR0ZXIsIEwuTEVUVEVSU1tpXSwgTC5MRVRURVJTW2ldKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgY29hY2ggbGV0dGVyICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfQ09BQ0godGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgY29hY2ggZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUuc2V0Q29hY2godGhpcy5jdXJyZW50Q3R4LCB0aGlzLmlucHV0TGV0dGVyLnZhbHVlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9Y29hY2hdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5pbnB1dExldHRlci52YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgZXhjdXNlIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgRXhjdXNlUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignZXhjdXNlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0VYQ1VTRTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLmV4Y3VzZXMuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgZXhjdXNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIGV4Y3VzZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoUkFHLnN0YXRlLmV4Y3VzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBleGN1c2UgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUuZXhjdXNlID0gZW50cnkuaW5uZXJUZXh0O1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCdleGN1c2UnLCBSQUcuc3RhdGUuZXhjdXNlKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGludGVnZXIgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBJbnRlZ2VyUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0IDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBvcHRpb25hbCBzdWZmaXggbGFiZWwgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGFiZWwgICA6IEhUTUxMYWJlbEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgc2luZ3VsYXIgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzaW5ndWxhcj8gIDogc3RyaW5nO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvcHRpb25hbCBwbHVyYWwgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBwbHVyYWw/ICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgd2FudHMgd29yZCBkaWdpdHMgKi9cclxuICAgIHByaXZhdGUgd29yZHM/ICAgICA6IGJvb2xlYW47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignaW50ZWdlcicpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21MYWJlbCAgID0gRE9NLnJlcXVpcmUoJ2xhYmVsJywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgaW50ZWdlciBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5zaW5ndWxhciAgID0gdGFyZ2V0LmRhdGFzZXRbJ3Npbmd1bGFyJ107XHJcbiAgICAgICAgdGhpcy5wbHVyYWwgICAgID0gdGFyZ2V0LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIHRoaXMud29yZHMgICAgICA9IFBhcnNlLmJvb2xlYW4odGFyZ2V0LmRhdGFzZXRbJ3dvcmRzJ10gfHwgJ2ZhbHNlJyk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKHRoaXMuc2luZ3VsYXIgJiYgdmFsdWUgPT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICBlbHNlIGlmICh0aGlzLnBsdXJhbCAmJiB2YWx1ZSAhPT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0lOVEVHRVIodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50Q3R4ID09PSAnY29hY2hlcycpIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0Lm1pbiA9ICcwJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0Lm1heCA9ICc2MCc7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnJlbW92ZUF0dHJpYnV0ZSgnbWluJyk7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5yZW1vdmVBdHRyaWJ1dGUoJ21heCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgICAgPSB2YWx1ZS50b1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBpbnRlZ2VyIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gQ2FuJ3QgdXNlIHZhbHVlQXNOdW1iZXIgZHVlIHRvIGlPUyBpbnB1dCB0eXBlIHdvcmthcm91bmRzXHJcbiAgICAgICAgbGV0IGludCAgICA9IHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTihpbnQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50Q3R4ID09PSAnY29hY2hlcycpIHtcclxuICAgICAgICAgICAgaWYgKGludCA8IDApIHsgaW50ID0gMDsgdGhpcy5pbnB1dERpZ2l0LnZhbHVlID0gJzAnOyB9XHJcbiAgICAgICAgICAgIGlmIChpbnQgPiA2MCkgeyBpbnQgPSA2MDsgdGhpcy5pbnB1dERpZ2l0LnZhbHVlID0gJzYwJzsgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGludFN0ciA9ICh0aGlzLndvcmRzKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSAnJztcclxuXHJcbiAgICAgICAgaWYgKGludCA9PT0gMSAmJiB0aGlzLnNpbmd1bGFyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnNpbmd1bGFyfWA7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHRoaXMucGx1cmFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnBsdXJhbH1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMucGx1cmFsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldEludGVnZXIodGhpcy5jdXJyZW50Q3R4LCBpbnQpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1pbnRlZ2VyXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IGludFN0cik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgbmFtZWQgdHJhaW4gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBOYW1lZFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ25hbWVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX05BTUVEO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2UubmFtZWQuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgbmFtZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIG5hbWVkIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLm5hbWVkID0gZW50cnkuaW5uZXJUZXh0O1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCduYW1lZCcsIFJBRy5zdGF0ZS5uYW1lZCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwaHJhc2VzZXQgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBQaHJhc2VzZXRQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIHJlZmVyZW5jZSB0YWcgZm9yIHRoZSBjdXJyZW50IHBocmFzZXNldCBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50UmVmIDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGhyYXNlc2V0Jyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBwaHJhc2VzZXQncyBsaXN0IG9mIHBocmFzZXMgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgbGV0IHJlZiAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdyZWYnKTtcclxuICAgICAgICBsZXQgaWR4ICAgICAgID0gcGFyc2VJbnQoIERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdpZHgnKSApO1xyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBhc3NlcnQoIFJBRy5kYXRhYmFzZS5nZXRQaHJhc2VzZXQocmVmKSEgKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UmVmICAgICAgICAgID0gcmVmO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1BIUkFTRVNFVChyZWYpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIuY2xlYXIoKTtcclxuXHJcbiAgICAgICAgLy8gRm9yIGVhY2ggcGhyYXNlLCB3ZSBuZWVkIHRvIHJ1biBpdCB0aHJvdWdoIHRoZSBwaHJhc2VyIHVzaW5nIHRoZSBjdXJyZW50IHN0YXRlXHJcbiAgICAgICAgLy8gdG8gZ2VuZXJhdGUgXCJwcmV2aWV3c1wiIG9mIGhvdyB0aGUgcGhyYXNlIHdpbGwgbG9vay5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBwaHJhc2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG5cclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2VzZXQuY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQsIHBocmFzZSk7XHJcbiAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MocGhyYXNlKTtcclxuXHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lclRleHQgICA9IERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQocGhyYXNlKTtcclxuICAgICAgICAgICAgcGhyYXNlLmRhdGFzZXQuaWR4ID0gaS50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kb21DaG9vc2VyLmFkZFJhdyhwaHJhc2UsIGkgPT09IGlkeCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgcGhyYXNlc2V0IGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KGVudHJ5LmRhdGFzZXRbJ2lkeCddISk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRQaHJhc2VzZXRJZHgodGhpcy5jdXJyZW50UmVmLCBpZHgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnJlZnJlc2hQaHJhc2VzZXQodGhpcy5jdXJyZW50UmVmKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBsYXRmb3JtIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGxhdGZvcm1QaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG51bWVyaWNhbCBpbnB1dCBzcGlubmVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlnaXQgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBsZXR0ZXIgZHJvcC1kb3duIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMZXR0ZXIgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdwbGF0Zm9ybScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgICAgICAgICAgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciAgICAgICAgID0gRE9NLnJlcXVpcmUoJ3NlbGVjdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QTEFURk9STTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgcGxhdGZvcm0gZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgPSB2YWx1ZVswXTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gdmFsdWVbMV07XHJcbiAgICAgICAgdGhpcy51cGRhdGVMZXR0ZXJWaXNpYmlsaXR5KCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHBsYXRmb3JtIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGludFZhbCA9IHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSk7XHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTiggaW50VmFsICkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmIChpbnRWYWwgPCAwKSB7IGludFZhbCA9IDA7IHRoaXMuaW5wdXREaWdpdC52YWx1ZSA9ICcwJzsgfVxyXG4gICAgICAgIGlmIChpbnRWYWwgPiA2MCkgeyBpbnRWYWwgPSA2MDsgdGhpcy5pbnB1dERpZ2l0LnZhbHVlID0gJzYwJzsgfVxyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZUxldHRlclZpc2liaWxpdHkoKTtcclxuXHJcbiAgICAgICAgLy8gJ00nICg5wr4pIGlzIG9ubHkgdmFsaWQgZm9yIHBsYXRmb3JtIDlcclxuICAgICAgICBpZiAoaW50VmFsICE9PSA5ICYmIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPT09ICdNJylcclxuICAgICAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9ICcnO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUucGxhdGZvcm0gPSBbdGhpcy5pbnB1dERpZ2l0LnZhbHVlLCB0aGlzLmlucHV0TGV0dGVyLnZhbHVlXTtcclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoICdwbGF0Zm9ybScsIChSQUcuc3RhdGUucGxhdGZvcm1bMV0gPT09ICdNJylcclxuICAgICAgICAgICAgPyBSQUcuc3RhdGUucGxhdGZvcm1bMF0gKyAnwr4nXHJcbiAgICAgICAgICAgIDogUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhpZGVzIGFuZCBjbGVhcnMgdGhlIGxldHRlciBzZWxlY3RvciBpZiBwbGF0Zm9ybSBudW1iZXIgaXMgPiAyNiAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVMZXR0ZXJWaXNpYmlsaXR5KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGludFZhbCA9IHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSk7XHJcbiAgICAgICAgbGV0IGhpZGUgICA9IGlzTmFOKGludFZhbCkgfHwgaW50VmFsID4gMjY7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIuaGlkZGVuICAgPSBoaWRlO1xyXG4gICAgICAgIGlmIChoaWRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSAgICA9ICcnO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gT25seSBwbGF0Zm9ybSA5IGhhcyBhIFwiOcK+XCIgKE0pIHByb251bmNpYXRpb25cclxuICAgICAgICBsZXQgbU9wdGlvbiA9IHRoaXMuaW5wdXRMZXR0ZXIucXVlcnlTZWxlY3Rvcignb3B0aW9uW3ZhbHVlPVwiTVwiXScpIGFzIEhUTUxPcHRpb25FbGVtZW50O1xyXG4gICAgICAgIGlmIChtT3B0aW9uKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbU9wdGlvbi5oaWRkZW4gICA9ICEoaW50VmFsID09PSA5KTtcclxuICAgICAgICAgICAgbU9wdGlvbi5kaXNhYmxlZCA9ICEoaW50VmFsID09PSA5KTtcclxuICAgICAgICAgICAgaWYgKGludFZhbCAhPT0gOSAmJiB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID09PSAnTScpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gJyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNlcnZpY2UgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTZXJ2aWNlUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBzZXJ2aWNlIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdzZXJ2aWNlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2Uuc2VydmljZXMuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3Mgc2VydmljZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NFUlZJQ0UodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgc2VydmljZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoIFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHNlcnZpY2UgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUuc2V0U2VydmljZSh0aGlzLmN1cnJlbnRDdHgsIGVudHJ5LmlubmVyVGV4dCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPXNlcnZpY2VdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gZW50cnkuaW5uZXJUZXh0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHN0YXRpb24gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBzaGFyZWQgc3RhdGlvbiBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgY2hvb3NlciA6IFN0YXRpb25DaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgc3RhdGlvbiBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuICAgIC8qKiBIb2xkcyB0aGUgb25PcGVuIGRlbGVnYXRlIGZvciBTdGF0aW9uUGlja2VyIG9yIGZvciBTdGF0aW9uTGlzdFBpY2tlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uT3BlbiAgICAgOiAodGFyZ2V0OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IodGFnOiBzdHJpbmcgPSAnc3RhdGlvbicpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIodGFnKTtcclxuXHJcbiAgICAgICAgaWYgKCFTdGF0aW9uUGlja2VyLmNob29zZXIpXHJcbiAgICAgICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3NlciA9IG5ldyBTdGF0aW9uQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uT3BlbiA9IHRoaXMub25TdGF0aW9uUGlja2VyT3Blbi5iaW5kKHRoaXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaXJlcyB0aGUgb25PcGVuIGRlbGVnYXRlIHJlZ2lzdGVyZWQgZm9yIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4odGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQXR0YWNoZXMgdGhlIHN0YXRpb24gY2hvb3NlciBhbmQgZm9jdXNlcyBpdCBvbnRvIHRoZSBjdXJyZW50IGVsZW1lbnQncyBzdGF0aW9uICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uUGlja2VyT3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgY2hvb3NlciAgICAgPSBTdGF0aW9uUGlja2VyLmNob29zZXI7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY2hvb3Nlci5hdHRhY2godGhpcywgdGhpcy5vblNlbGVjdFN0YXRpb24pO1xyXG4gICAgICAgIGNob29zZXIucHJlc2VsZWN0Q29kZSggUkFHLnN0YXRlLmdldFN0YXRpb24odGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgICAgIGNob29zZXIuc2VsZWN0T25DbGljayA9IHRydWU7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT04odGhpcy5jdXJyZW50Q3R4KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgc3RhdGlvbiBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25DbGljayhldik7IH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25JbnB1dChldik7IH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHN0YXRpb24gZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3RTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ID0gYFtkYXRhLXR5cGU9c3RhdGlvbl1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gO1xyXG4gICAgICAgIGxldCBjb2RlICA9IGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSE7XHJcbiAgICAgICAgbGV0IG5hbWUgID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCwgY29kZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5KVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBuYW1lKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJzdGF0aW9uUGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vLi4vdmVuZG9yL2RyYWdnYWJsZS5kLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIGxpc3QgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdFBpY2tlciBleHRlbmRzIFN0YXRpb25QaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNvbnRhaW5lciBmb3IgdGhlIGxpc3QgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MaXN0ICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGFkZCBzdGF0aW9uIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5BZGQgICAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGNsb3NlIHBpY2tlciBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQ2xvc2UgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBkcm9wIHpvbmUgZm9yIGRlbGV0aW5nIHN0YXRpb24gZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRGVsICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhY3R1YWwgc29ydGFibGUgbGlzdCBvZiBzdGF0aW9ucyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExpc3QgICAgOiBIVE1MRExpc3RFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBwbGFjZWhvbGRlciBzaG93biBpZiB0aGUgbGlzdCBpcyBlbXB0eSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21FbXB0eUxpc3QgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKFwic3RhdGlvbmxpc3RcIik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGlzdCAgICAgID0gRE9NLnJlcXVpcmUoJy5zdGF0aW9uTGlzdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmJ0bkFkZCAgICAgICA9IERPTS5yZXF1aXJlKCcuYWRkU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuYnRuQ2xvc2UgICAgID0gRE9NLnJlcXVpcmUoJy5jbG9zZVBpY2tlcicsIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21EZWwgICAgICAgPSBET00ucmVxdWlyZSgnLmRlbFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdCAgICA9IERPTS5yZXF1aXJlKCdkbCcsICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0ID0gRE9NLnJlcXVpcmUoJ3AnLCAgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4gICAgICAgPSB0aGlzLm9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIG5ldyBEcmFnZ2FibGUuU29ydGFibGUoW3RoaXMuaW5wdXRMaXN0LCB0aGlzLmRvbURlbF0sIHsgZHJhZ2dhYmxlOiAnZGQnIH0pXHJcbiAgICAgICAgICAgIC8vIEhhdmUgdG8gdXNlIHRpbWVvdXQsIHRvIGxldCBEcmFnZ2FibGUgZmluaXNoIHNvcnRpbmcgdGhlIGxpc3RcclxuICAgICAgICAgICAgLm9uKCAnZHJhZzpzdG9wJywgZXYgPT4gc2V0VGltZW91dCgoKSA9PiB0aGlzLm9uRHJhZ1N0b3AoZXYpLCAxKSApXHJcbiAgICAgICAgICAgIC5vbiggJ21pcnJvcjpjcmVhdGUnLCB0aGlzLm9uRHJhZ01pcnJvckNyZWF0ZS5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQb3B1bGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLCB3aXRoIHRoZSBzZWxlY3RlZCBsaXN0LiBCZWNhdXNlIHRoaXMgcGlja2VyXHJcbiAgICAgKiBleHRlbmRzIGZyb20gU3RhdGlvbkxpc3QsIHRoaXMgaGFuZGxlciBvdmVycmlkZXMgdGhlICdvbk9wZW4nIGRlbGVnYXRlIHByb3BlcnR5XHJcbiAgICAgKiBvZiBTdGF0aW9uTGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IFN0YXRpb24gbGlzdCBlZGl0b3IgZWxlbWVudCB0byBvcGVuIGZvclxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uTGlzdFBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2luY2Ugd2Ugc2hhcmUgdGhlIHN0YXRpb24gcGlja2VyIHdpdGggU3RhdGlvbkxpc3QsIGdyYWIgaXRcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25BZGRTdGF0aW9uKTtcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuc2VsZWN0T25DbGljayA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBlbnRyaWVzICAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgpLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT05MSVNUKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBhbGwgb2xkIGxpc3QgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgLy8gRmluYWxseSwgcG9wdWxhdGUgbGlzdCBmcm9tIHRoZSBjbGlja2VkIHN0YXRpb24gbGlzdCBlbGVtZW50XHJcbiAgICAgICAgZW50cmllcy5mb3JFYWNoKCB2ID0+IHRoaXMuYWRkKHYpICk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkIHsgc3VwZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbkNsaWNrKGV2KTtcclxuXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5DbG9zZSlcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIC8vIEZvciBtb2JpbGUgdXNlcnMsIHN3aXRjaCB0byBzdGF0aW9uIGNob29zZXIgc2NyZWVuIGlmIFwiQWRkLi4uXCIgd2FzIGNsaWNrZWRcclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkFkZClcclxuICAgICAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGtleWJvYXJkIG5hdmlnYXRpb24gZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uSW5wdXQoZXYpO1xyXG5cclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciBjb250cm9sXHJcbiAgICAgICAgaWYgKCAhZm9jdXNlZCB8fCAhdGhpcy5pbnB1dExpc3QuY29udGFpbnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGZvY3VzZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW50cnkgZGVsZXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnRGVsZXRlJyB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9jdXMgb24gbmV4dCBlbGVtZW50IG9yIHBhcmVudCBvbiBkZWxldGVcclxuICAgICAgICAgICAgbGV0IG5leHQgPSBmb2N1c2VkLnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBmb2N1c2VkLm5leHRFbGVtZW50U2libGluZyAgICAgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCB0aGlzLmlucHV0TGlzdDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZvY3VzZWQpO1xyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVyIGZvciB3aGVuIGEgc3RhdGlvbiBpcyBjaG9zZW4gKi9cclxuICAgIHByaXZhdGUgb25BZGRTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gdGhpcy5hZGQoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIC8vIFN3aXRjaCBiYWNrIHRvIGJ1aWxkZXIgc2NyZWVuLCBpZiBvbiBtb2JpbGVcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgLy8gRm9jdXMgb25seSBpZiBvbiBtb2JpbGUsIHNpbmNlIHRoZSBzdGF0aW9uIGxpc3QgaXMgb24gYSBkZWRpY2F0ZWQgc2NyZWVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLmZvY3VzKCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uc2Nyb2xsSW50b1ZpZXcoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRml4ZXMgbWlycm9ycyBub3QgaGF2aW5nIGNvcnJlY3Qgd2lkdGggb2YgdGhlIHNvdXJjZSBlbGVtZW50LCBvbiBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgb25EcmFnTWlycm9yQ3JlYXRlKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5kYXRhLnNvdXJjZSEuc3R5bGUud2lkdGggPSBldi5kYXRhLm9yaWdpbmFsU291cmNlIS5jbGllbnRXaWR0aCArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgZHJhZ2dhYmxlIHN0YXRpb24gbmFtZSBiZWluZyBkcm9wcGVkICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ1N0b3AoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmRvbURlbClcclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgYWRkcyBhIG5ldyBlbnRyeSBmb3IgdGhlIGJ1aWxkZXIgbGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSBhbiBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFkZChjb2RlOiBzdHJpbmcpIDogU3RhdGlvbkxpc3RJdGVtXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gbmV3IFN0YXRpb25MaXN0SXRlbShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHRoZSBuZXcgZW50cnkgdG8gdGhlIHNvcnRhYmxlIGxpc3RcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5hcHBlbmRDaGlsZChuZXdFbnRyeS5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmhpZGRlbiA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIERpc2FibGUgdGhlIGFkZGVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZGlzYWJsZShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gRGVsZXRlIGl0ZW0gb24gZG91YmxlIGNsaWNrXHJcbiAgICAgICAgbmV3RW50cnkuZG9tLm9uZGJsY2xpY2sgPSBfID0+IHRoaXMucmVtb3ZlKG5ld0VudHJ5LmRvbSk7XHJcblxyXG4gICAgICAgIHJldHVybiBuZXdFbnRyeTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlbW92ZXMgdGhlIGdpdmVuIHN0YXRpb24gZW50cnkgZWxlbWVudCBmcm9tIHRoZSBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbnRyeSBFbGVtZW50IG9mIHRoZSBzdGF0aW9uIGVudHJ5IHRvIHJlbW92ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlbW92ZShlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICggIXRoaXMuZG9tTGlzdC5jb250YWlucyhlbnRyeSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcignQXR0ZW1wdGVkIHRvIHJlbW92ZSBlbnRyeSBub3Qgb24gc3RhdGlvbiBsaXN0IGJ1aWxkZXInKTtcclxuXHJcbiAgICAgICAgLy8gRW5hYmxlZCB0aGUgcmVtb3ZlZCBzdGF0aW9uIGluIHRoZSBjaG9vc2VyXHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmVuYWJsZShlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaGlsZHJlbiA9IHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCB1cGRhdGUgaWYgbGlzdCBpcyBlbXB0eVxyXG4gICAgICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGxpc3QgPSBbXTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBlbnRyeSA9IGNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgbGlzdC5wdXNoKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHRleHRMaXN0ID0gU3RyaW5ncy5mcm9tU3RhdGlvbkxpc3QobGlzdC5zbGljZSgpLCB0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIGxldCBxdWVyeSAgICA9IGBbZGF0YS10eXBlPXN0YXRpb25saXN0XVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWA7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgsIGxpc3QpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGV4dExpc3QpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgdGltZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFRpbWVQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIHRpbWUgaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dFRpbWU6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCB0aW1lIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCd0aW1lJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHRpbWUgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9USU1FKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lLnZhbHVlID0gUkFHLnN0YXRlLmdldFRpbWUodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0VGltZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSB0aW1lIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFRpbWUodGhpcy5jdXJyZW50Q3R4LCB0aGlzLmlucHV0VGltZS52YWx1ZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPXRpbWVdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5pbnB1dFRpbWUudmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBCYXNlIGNsYXNzIGZvciBjb25maWd1cmF0aW9uIG9iamVjdHMsIHRoYXQgY2FuIHNhdmUsIGxvYWQsIGFuZCByZXNldCB0aGVtc2VsdmVzICovXHJcbmFic3RyYWN0IGNsYXNzIENvbmZpZ0Jhc2U8VCBleHRlbmRzIENvbmZpZ0Jhc2U8VD4+XHJcbntcclxuICAgIC8qKiBsb2NhbFN0b3JhZ2Uga2V5IHdoZXJlIGNvbmZpZyBpcyBleHBlY3RlZCB0byBiZSBzdG9yZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFVFRJTkdTX0tFWSA6IHN0cmluZyA9ICdzZXR0aW5ncyc7XHJcblxyXG4gICAgLyoqIFByb3RvdHlwZSBvYmplY3QgZm9yIGNyZWF0aW5nIG5ldyBjb3BpZXMgb2Ygc2VsZiAqL1xyXG4gICAgcHJpdmF0ZSB0eXBlIDogKG5ldyAoKSA9PiBUKTtcclxuXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoIHR5cGU6IChuZXcgKCkgPT4gVCkgKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBsb2FkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGxvYWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgc2V0dGluZ3MgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oQ29uZmlnQmFzZS5TRVRUSU5HU19LRVkpO1xyXG5cclxuICAgICAgICBpZiAoIXNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGNvbmZpZyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIGNvbmZpZyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfTE9BRF9GQUlMKGVyci5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgc2F2ZXMgdGhpcyBjb25maWd1cmF0aW9uIHRvIGxvY2FsU3RvcmFnZSAqL1xyXG4gICAgcHVibGljIHNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSggQ29uZmlnQmFzZS5TRVRUSU5HU19LRVksIEpTT04uc3RyaW5naWZ5KHRoaXMpICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfU0FWRV9GQUlMKGVyci5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgZGVsZXRlcyB0aGlzIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UgYW5kIHJlc2V0cyBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKCB0aGlzLCBuZXcgdGhpcy50eXBlKCkgKTtcclxuICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKENvbmZpZ0Jhc2UuU0VUVElOR1NfS0VZKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGVycilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFsZXJ0KCBMLkNPTkZJR19SRVNFVF9GQUlMKGVyci5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwiY29uZmlnQmFzZS50c1wiLz5cclxuXHJcbi8qKiBIb2xkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZm9yIFJBRyAqL1xyXG5jbGFzcyBDb25maWcgZXh0ZW5kcyBDb25maWdCYXNlPENvbmZpZz5cclxue1xyXG4gICAgLyoqIElmIHVzZXIgaGFzIGNsaWNrZWQgc2h1ZmZsZSBhdCBsZWFzdCBvbmNlICovXHJcbiAgICBwdWJsaWMgY2xpY2tlZEdlbmVyYXRlIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIElmIHVzZXIgaGFzIHJlYWQgdGhlIGRpc2NsYWltZXIgKi9cclxuICAgIHB1YmxpYyByZWFkRGlzY2xhaW1lciAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogVm9sdW1lIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgc3BlZWNoVm9sICAgICAgIDogbnVtYmVyICA9IDEuMDtcclxuICAgIC8qKiBQaXRjaCBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljIHNwZWVjaFBpdGNoICAgICA6IG51bWJlciAgPSAxLjA7XHJcbiAgICAvKiogUmF0ZSBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljIHNwZWVjaFJhdGUgICAgICA6IG51bWJlciAgPSAxLjA7XHJcbiAgICAvKiogVk9YIGtleSBvZiB0aGUgY2hpbWUgdG8gdXNlIHByaW9yIHRvIHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgdm94Q2hpbWUgICAgICAgIDogc3RyaW5nICA9ICcnO1xyXG4gICAgLyoqIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCBvZiB0aGUgY3VzdG9tIFZPWCB2b2ljZSB0byB1c2UgKi9cclxuICAgIHB1YmxpYyB2b3hDdXN0b21QYXRoICAgOiBzdHJpbmcgID0gJyc7XHJcbiAgICAvKiogV2hldGhlciB0byB1c2UgdGhlIFZPWCBlbmdpbmUgKi9cclxuICAgIHB1YmxpYyB2b3hFbmFibGVkICAgICAgOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIC8qKiBSZWxhdGl2ZSBvciBhYnNvbHV0ZSBVUkwgb2YgdGhlIFZPWCB2b2ljZSB0byB1c2UgKi9cclxuICAgIHB1YmxpYyB2b3hQYXRoICAgICAgICAgOiBzdHJpbmcgID0gJ2h0dHBzOi8venp6LWNyZWF0b3IuZ2l0aHViLmlvL1JBRy1WT1gtUm95JztcclxuXHJcbiAgICAvKiogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UgYXMgdm9pY2UgbmFtZSwgb3IgJycgaWYgdW5zZXQgKi9cclxuICAgIHByaXZhdGUgX3NwZWVjaFZvaWNlIDogc3RyaW5nID0gJyc7XHJcbiAgICAvKiogSW1wdWxzZSByZXNwb25zZSB0byB1c2UgZm9yIFZPWCdzIHJldmVyYiAqL1xyXG4gICAgcHJpdmF0ZSBfdm94UmV2ZXJiICAgOiBzdHJpbmcgPSAnaXIuc3RhbGJhbnMud2F2JztcclxuXHJcbiAgICAvKipcclxuICAgICAqIENob2ljZSBvZiBzcGVlY2ggdm9pY2UgdG8gdXNlLCBhcyBhIHZvaWNlIG5hbWUuIEJlY2F1c2Ugb2YgdGhlIGFzeW5jIG5hdHVyZSBvZlxyXG4gICAgICogZ2V0Vm9pY2VzLCB0aGUgZGVmYXVsdCB2YWx1ZSB3aWxsIGJlIGZldGNoZWQgZnJvbSBpdCBlYWNoIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIGdldCBzcGVlY2hWb2ljZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBhIHVzZXItZGVmaW5lZCB2YWx1ZSwgdXNlIHRoYXRcclxuICAgICAgICBpZiAodGhpcy5fc3BlZWNoVm9pY2UgIT09ICcnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3BlZWNoVm9pY2U7XHJcblxyXG4gICAgICAgIC8vIFNlbGVjdCBFbmdsaXNoIHZvaWNlcyBieSBkZWZhdWx0XHJcbiAgICAgICAgbGV0IHZvaWNlcyA9IFJBRy5zcGVlY2guYnJvd3NlclZvaWNlcztcclxuXHJcbiAgICAgICAgZm9yIChsZXQgbmFtZSBpbiB2b2ljZXMpXHJcbiAgICAgICAgaWYgICh2b2ljZXNbbmFtZV0ubGFuZyA9PT0gJ2VuLUdCJyB8fCB2b2ljZXNbbmFtZV0ubGFuZyA9PT0gJ2VuLVVTJylcclxuICAgICAgICAgICAgcmV0dXJuIG5hbWU7XHJcblxyXG4gICAgICAgIC8vIEVsc2UsIGZpcnN0IHZvaWNlIG9uIHRoZSBsaXN0XHJcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHZvaWNlcylbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGNob2ljZSBvZiBzcGVlY2ggdG8gdXNlLCBhcyB2b2ljZSBuYW1lICovXHJcbiAgICBzZXQgc3BlZWNoVm9pY2UodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zcGVlY2hWb2ljZSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBpbXB1bHNlIHJlc3BvbnNlIGZpbGUgdG8gdXNlIGZvciBWT1ggZW5naW5lJ3MgcmV2ZXJiICovXHJcbiAgICBnZXQgdm94UmV2ZXJiKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICAvLyBSZXNldCBjaG9pY2Ugb2YgcmV2ZXJiIGlmIGl0J3MgaW52YWxpZFxyXG4gICAgICAgIGxldCBjaG9pY2VzID0gT2JqZWN0LmtleXMoVm94RW5naW5lLlJFVkVSQlMpO1xyXG5cclxuICAgICAgICBpZiAoICFjaG9pY2VzLmluY2x1ZGVzKHRoaXMuX3ZveFJldmVyYikgKVxyXG4gICAgICAgICAgICB0aGlzLl92b3hSZXZlcmIgPSBjaG9pY2VzWzBdO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5fdm94UmV2ZXJiO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBpbXB1bHNlIHJlc3BvbnNlIGZpbGUgdG8gdXNlIGZvciBWT1ggZW5naW5lJ3MgcmV2ZXJiICovXHJcbiAgICBzZXQgdm94UmV2ZXJiKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fdm94UmV2ZXJiID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGF1dG9Mb2FkOiBib29sZWFuID0gZmFsc2UpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoQ29uZmlnKTtcclxuXHJcbiAgICAgICAgaWYgKGF1dG9Mb2FkKVxyXG4gICAgICAgICAgICB0aGlzLmxvYWQoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cblxuaW50ZXJmYWNlIERhc2hCcmFuY2hcbntcbiAgICBjb25kaXRpb246IHN0cmluZztcbiAgICAvKiogTWVhbmluZyBkZXBlbmRzIG9uIGNvbmRpdGlvbjogZGVsYXkgbWludXRlcywgcmFuZG9tIHBlcmNlbnQsIGhvdXIsIHBsYXRmb3JtIHRleHQsIHNlcnZpY2UgdGV4dCAqL1xuICAgIHRocmVzaG9sZD86IG51bWJlciB8IHN0cmluZztcbiAgICAvKiogTGVnYWN5OiBzYW1lIGFzIHRocmVzaG9sZCBmb3IgdGhlIHJhbmRvbSBjb25kaXRpb24gKi9cbiAgICBwcm9iYWJpbGl0eT86IG51bWJlcjtcbiAgICB0YXJnZXQ6IG51bWJlciB8ICdlbmQnIHwgc3RyaW5nO1xuICAgIC8qKiBPcHRpb25hbCBodW1hbiBsYWJlbCBmb3IgdGhlIGJyYW5jaDsgdW51c2VkIGJ5IHRoZSBydW5uZXIgKi9cbiAgICBsYWJlbD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIERhc2hTdGVwXG57XG4gICAgdHlwZTogJ2Fubm91bmNlbWVudCcgfCAnd2FpdCc7XG4gICAgc3RhdGVKc29uPzogc3RyaW5nO1xuICAgIGdhcE1zOiBudW1iZXI7XG4gICAgd2FpdFNlY29uZHM/OiBudW1iZXI7XG4gICAgbGFiZWw/OiBzdHJpbmc7XG4gICAgLyoqIE9yZGVyZWQgYnJhbmNoZXMgKGlmIC8gZWxpZik6IGZpcnN0IG1hdGNoIHdpbnMsIG5vbmUgbWF0Y2hpbmcgZmFsbHMgdGhyb3VnaCAoZWxzZSkgKi9cbiAgICBicmFuY2hlcz86IERhc2hCcmFuY2hbXTtcbiAgICAvKiogTGVnYWN5IHNpbmdsZSBicmFuY2g7IG1pZ3JhdGVkIHRvIGJyYW5jaGVzW10gb24gbG9hZCAqL1xuICAgIGJyYW5jaD86IERhc2hCcmFuY2g7XG59XG5cbmludGVyZmFjZSBEYXNoU2NlbmFyaW9cbntcbiAgICBpZDogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBzdGVwczogRGFzaFN0ZXBbXTtcbiAgICBsb29wQ291bnQ6IG51bWJlcjtcbiAgICBjcmVhdGVkQXQ6IG51bWJlcjtcbiAgICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuLyoqIE9uZSBzZWxlY3RhYmxlIGJyYW5jaCBjb25kaXRpb24sIGFuZCBob3cgaXRzIHRocmVzaG9sZCBpbnB1dCBzaG91bGQgcmVhZCAqL1xuaW50ZXJmYWNlIERhc2hCcmFuY2hTcGVjXG57XG4gICAgaWQ6IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlucHV0OiBzdHJpbmc7XG4gICAgbWluPzogc3RyaW5nO1xuICAgIG1heD86IHN0cmluZztcbiAgICBwbGFjZWhvbGRlcj86IHN0cmluZztcbn1cblxuLyoqIENvbmRpdGlvbnMgdGhlIGRhc2hib2FyZCBvZmZlcnMsIGluIHRoZSBvcmRlciB0aGV5IGFwcGVhciBpbiB0aGUgZWRpdG9yICovXG5jb25zdCBEQVNIX0JSQU5DSF9DT05ESVRJT05TOiBEYXNoQnJhbmNoU3BlY1tdID1cbltcbiAgICB7IGlkOiAnZGVsYXknLCAgICBsYWJlbDogJ0RlbGF5ZWQgYnkgYXQgbGVhc3QgKG1pbnV0ZXMpJywgaW5wdXQ6ICdudW1iZXInLCBtaW46ICcwJyB9LFxuICAgIHsgaWQ6ICdyYW5kb20nLCAgIGxhYmVsOiAnQ2hhbmNlIG9mIHRha2luZyBpdCAoJSknLCAgICAgICBpbnB1dDogJ251bWJlcicsIG1pbjogJzAnLCBtYXg6ICcxMDAnIH0sXG4gICAgeyBpZDogJ3RpbWUnLCAgICAgbGFiZWw6ICdDdXJyZW50IGhvdXIgaXMgYXQgbGVhc3QgKDAtMjMpJywgaW5wdXQ6ICdudW1iZXInLCBtaW46ICcwJywgbWF4OiAnMjMnIH0sXG4gICAgeyBpZDogJ3BsYXRmb3JtJywgbGFiZWw6ICdQbGF0Zm9ybSBpcycsICAgICAgICAgICAgICAgICAgIGlucHV0OiAndGV4dCcsICAgcGxhY2Vob2xkZXI6ICdlLmcuIDIgb3IgOcK+JyB9LFxuICAgIHsgaWQ6ICdzZXJ2aWNlJywgIGxhYmVsOiAnU2VydmljZSBjb250YWlucycsICAgICAgICAgICAgICBpbnB1dDogJ3RleHQnLCAgIHBsYWNlaG9sZGVyOiAnZS5nLiBleHByZXNzJyB9XG5dO1xuXG5jbGFzcyBTY2VuYXJpb0Rhc2hib2FyZFxue1xuICAgIHByaXZhdGUgc3RvcmFnZUtleSA9ICdyYWcuc2NlbmFyaW9zJztcbiAgICBwcml2YXRlIHNjZW5hcmlvczogRGFzaFNjZW5hcmlvW10gPSBbXTtcbiAgICBwcml2YXRlIGN1cnJlbnRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSBwYW5lbDogSFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBwcm9ncmVzc1RleHRFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIHByb2dyZXNzRmlsbEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgIC8qKiBJbmRleCBvZiB0aGUgc3RlcCB3aG9zZSBpbmxpbmUgYnJhbmNoIGVkaXRvciBpcyBvcGVuLCBvciAtMSB3aGVuIGNsb3NlZCAqL1xuICAgIHByaXZhdGUgYnJhbmNoRWRpdG9ySWR4OiBudW1iZXIgPSAtMTtcbiAgICAvKiogU3RhZ2VkIGJyYW5jaGVzIG9mIHRoZSBvcGVuIGVkaXRvciAoY29tbWl0dGVkIG9uIFwiU2F2ZSBhbGxcIikgKi9cbiAgICBwcml2YXRlIGJyYW5jaEVkaXRvclJvd3M6IERhc2hCcmFuY2hbXSA9IFtdO1xuICAgIC8qKiBDb25kaXRpb24gcHJlc2VsZWN0ZWQgaW4gdGhlIGVkaXRvcidzIFwibmV3IGJyYW5jaFwiIHJvdyAqL1xuICAgIHByaXZhdGUgYnJhbmNoTmV3Q29uZDogc3RyaW5nID0gJ2RlbGF5JztcbiAgICAvKiogSGVhcnRiZWF0IHRpbWVyIGtlZXBpbmcgdGhlIGNyb3NzLXRhYiBwbGF5YmFjayBsb2NrIGZyZXNoICovXG4gICAgcHJpdmF0ZSBwbGF5SGVhcnRiZWF0OiBudW1iZXIgPSAwO1xuICAgIC8qKiBJbm5lciBzcGFuIG9mIHRoZSBub3ctcGxheWluZyBsaW5lICh0aGUgc2Nyb2xsIHRhcmdldCkgKi9cbiAgICBwcml2YXRlIG5vd1BsYXlpbmdTcGFuOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgIC8qKiByQUYgaGFuZGxlIG9mIHRoZSBydW5uaW5nIG5vdy1wbGF5aW5nIHNjcm9sbCwgMCB3aGVuIGlkbGUgKi9cbiAgICBwcml2YXRlIG5vd1BsYXlpbmdUaW1lcjogbnVtYmVyID0gMDtcbiAgICAvKiogQ3VycmVudCB4IG9mZnNldCAocHgpIG9mIHRoZSBub3ctcGxheWluZyBzY3JvbGwgKi9cbiAgICBwcml2YXRlIG5vd1BsYXlpbmdPZmZzZXQ6IG51bWJlciA9IDA7XG5cbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxuICAgIHtcbiAgICAgICAgdGhpcy5wYW5lbCA9IERPTS5yZXF1aXJlKCcjc2NlbmFyaW9EYXNoYm9hcmQnKTtcbiAgICAgICAgdGhpcy5sb2FkQWxsKCk7XG5cbiAgICAgICAgLy8gUmVzdG9yZSB0aGUgbGFzdCBzZWxlY3RlZCBzY2VuYXJpbywgb3IgZGVmYXVsdCB0byB0aGUgZmlyc3Qgb25lXG4gICAgICAgIGxldCBzYXZlZElkID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3JhZy5jdXJyZW50U2NlbmFyaW9JZCcpO1xuICAgICAgICBpZiAoc2F2ZWRJZCAmJiB0aGlzLnNjZW5hcmlvcy5zb21lKHMgPT4gcy5pZCA9PT0gc2F2ZWRJZCkpXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRJZCA9IHNhdmVkSWQ7XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuc2NlbmFyaW9zLmxlbmd0aCA+IDApXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRJZCA9IHRoaXMuc2NlbmFyaW9zWzBdLmlkO1xuXG4gICAgICAgIFJBRy5zY2VuYXJpby5vblN0ZXAgPSAoaWR4OiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoaWR4LCB0b3RhbCk7XG4gICAgICAgICAgICB0aGlzLmhpZ2hsaWdodFN0ZXAoaWR4KTtcbiAgICAgICAgfTtcblxuICAgICAgICBSQUcuc2NlbmFyaW8ub25Db21wbGV0ZSA9ICgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMub25QbGF5YmFja0VuZGVkKCk7XG4gICAgICAgICAgICB0aGlzLnNldE5vd1BsYXlpbmcoJ1NjZW5hcmlvIGZpbmlzaGVkLicsIHRydWUpO1xuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdTY2VuYXJpbyBmaW5pc2hlZC4nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBSQUcuc2NlbmFyaW8ub25FcnJvciA9IChtc2c6IHN0cmluZykgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5vblBsYXliYWNrRW5kZWQoKTtcbiAgICAgICAgICAgIGFsZXJ0KCdTY2VuYXJpbyBlcnJvcjogJyArIG1zZyk7XG4gICAgICAgICAgICB0aGlzLnNldE5vd1BsYXlpbmcoJ1NjZW5hcmlvIHN0b3BwZWQ6ICcgKyBtc2csIGZhbHNlKTtcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCgnU2NlbmFyaW8gc3RvcHBlZDogJyArIG1zZywgZmFsc2UpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFRoZSBwYW5lbCBjb3ZlcnMgdGhlIG1haW4gc2NyZWVuLCBzbyBtaXJyb3Igd2hhdCBpcyBiZWluZ1xuICAgICAgICAvLyBhbm5vdW5jZWQgKGFuZCBhbnkgd2FpdCBjb3VudGRvd24pIGluc2lkZSBpdC5cbiAgICAgICAgUkFHLnNjZW5hcmlvLm9uVGV4dFVwZGF0ZSA9ICh0ZXh0OiBzdHJpbmcpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuc2V0Tm93UGxheWluZyh0ZXh0KTtcbiAgICAgICAgfTtcblxuICAgICAgICBSQUcuc2NlbmFyaW8ub25XYWl0Q291bnRkb3duID0gKHJlbWFpbmluZzogbnVtYmVyKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnNldE5vd1BsYXlpbmcoJ1dhaXRpbmcgJyArIHJlbWFpbmluZyArICdzLi4uJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gQW5vdGhlciB0YWIgKG9yIHRoaXMgdGFiJ3Mgb3duIHRvb2xiYXIpIG1heSBoYXZlIHdyaXR0ZW4gbmV3ZXJcbiAgICAgICAgLy8gc2NlbmFyaW9zOyByZS1yZWFkIHRoZW0gc28gdGhlIHBhbmVsIG5ldmVyIGNsb2JiZXJzIHRoZW0uXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzdG9yYWdlJywgKGU6IFN0b3JhZ2VFdmVudCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAncmFnLnNjZW5hcmlvcycgfHwgZS5rZXkgPT09ICdyYWcuY3VycmVudFNjZW5hcmlvSWQnKVxuICAgICAgICAgICAgICAgIHRoaXMucmVmcmVzaCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgIH1cblxuICAgIC8qKiBTaG93cyB0aGUgcGFuZWw7IGNhbGxlZCB3aGVuIHRoaXMgcGFnZSBpcyBydW5uaW5nIGluIHRoZSBkYXNoYm9hcmQgcm9sZSAqL1xuICAgIHB1YmxpYyBvcGVuKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMucGFuZWwuaGlkZGVuID0gZmFsc2U7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmUtcmVhZHMgc2NlbmFyaW9zIGZyb20gbG9jYWxTdG9yYWdlIGFuZCByZS1yZW5kZXJzLiBDYWxsZWQgYWZ0ZXJcbiAgICAgKiBhbnl0aGluZyB3cml0ZXMgdGhlIHNjZW5hcmlvcyBvdXQgZnJvbSB1bmRlciB0aGlzIGluc3RhbmNlJ3MgaW4tXG4gICAgICogbWVtb3J5IGNvcHkgKHRoZSB0b29sYmFyJ3MgQ2FwdHVyZS9VcGRhdGUgU3RlcCBidXR0b25zLCBhbm90aGVyIHRhYikuXG4gICAgICovXG4gICAgcHVibGljIHJlZnJlc2goKTogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5sb2FkQWxsKCk7XG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50KCkpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudElkID0gdGhpcy5zY2VuYXJpb3MubGVuZ3RoID4gMCA/IHRoaXMuc2NlbmFyaW9zWzBdLmlkIDogbnVsbDtcbiAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZClcbiAgICAgICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgncmFnLmN1cnJlbnRTY2VuYXJpb0lkJywgdGhpcy5jdXJyZW50SWQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYnJhbmNoRWRpdG9ySWR4ID0gLTE7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlcyB0aGUgXCJub3cgcGxheWluZ1wiIGxpbmUgaW5zaWRlIHRoZSBwYW5lbCwgc2Nyb2xsaW5nIHRoZSB0ZXh0XG4gICAgICogdGhyb3VnaCBpdCBsaWtlIHRoZSBtYWluIG1hcnF1ZWUgKHRoZSBwYW5lbCBjb3ZlcnMgI21hcnF1ZWUsIHNvIHRoaXNcbiAgICAgKiBsaW5lIGlzIHdoYXQgaXMgYWN0dWFsbHkgdmlzaWJsZSBkdXJpbmcgcGxheWJhY2spLiBXaGlsZSBhIHNjcm9sbCBpc1xuICAgICAqIGFscmVhZHkgcnVubmluZywgbmV3IHRleHQgc2ltcGx5IHN3YXBzIGluIHdpdGhvdXQgcmVzdGFydGluZywgc28gdGhlXG4gICAgICogd2FpdCBjb3VudGRvd24gdGlja3Mgc21vb3RobHkgaW5zdGVhZCBvZiBqdW1waW5nIHRvIHRoZSByaWdodCBlZGdlLlxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0Tm93UGxheWluZyh0ZXh0OiBzdHJpbmcsIGFuaW1hdGU6IGJvb2xlYW4gPSB0cnVlKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IGVsID0gdGhpcy5wYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaE5vd1BsYXlpbmcnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmICghZWwpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgbGV0IHNwYW4gPSBlbC5xdWVyeVNlbGVjdG9yKCdzcGFuJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoIXNwYW4pXG4gICAgICAgIHtcbiAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gJyc7XG4gICAgICAgICAgICBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgZWwuYXBwZW5kQ2hpbGQoc3Bhbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3BhbiAhPT0gdGhpcy5ub3dQbGF5aW5nU3BhbilcbiAgICAgICAge1xuICAgICAgICAgICAgLy8gVGhlIHBhbmVsIHdhcyByZS1yZW5kZXJlZCAobmV3IHNwYW4pOiBkcm9wIGFueSBydW5uaW5nIHNjcm9sbFxuICAgICAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMubm93UGxheWluZ1RpbWVyKTtcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gMDtcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1NwYW4gPSBzcGFuO1xuICAgICAgICB9XG5cbiAgICAgICAgc3Bhbi50ZXh0Q29udGVudCA9IHRleHQ7XG5cbiAgICAgICAgaWYgKCFhbmltYXRlKVxuICAgICAgICB7XG4gICAgICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5ub3dQbGF5aW5nVGltZXIpO1xuICAgICAgICAgICAgdGhpcy5ub3dQbGF5aW5nVGltZXIgPSAwO1xuICAgICAgICAgICAgc3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm5vd1BsYXlpbmdUaW1lciAhPT0gMClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAvLyBTYW1lIG1lY2hhbmljcyBhcyBNYXJxdWVlLnNldDogZW50ZXIgZnJvbSB0aGUgcmlnaHQsIGV4aXQgbGVmdCxcbiAgICAgICAgLy8gdGhlbiByZXN0IGF0IHRoZSBsZWZ0IGVkZ2VcbiAgICAgICAgdGhpcy5ub3dQbGF5aW5nT2Zmc2V0ID0gZWwuY2xpZW50V2lkdGg7XG4gICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLnNjcm9sbE5vd1BsYXlpbmcoKSk7XG4gICAgfVxuXG4gICAgLyoqIE9uZSBmcmFtZSBvZiB0aGUgbm93LXBsYXlpbmcgc2Nyb2xsICovXG4gICAgcHJpdmF0ZSBzY3JvbGxOb3dQbGF5aW5nKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBzcGFuID0gdGhpcy5ub3dQbGF5aW5nU3BhbjtcbiAgICAgICAgaWYgKCFzcGFuIHx8ICFzcGFuLnBhcmVudE5vZGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gMDtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubm93UGxheWluZ09mZnNldCAtPSA2O1xuICAgICAgICBzcGFuLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGVYKCR7dGhpcy5ub3dQbGF5aW5nT2Zmc2V0fXB4KWA7XG5cbiAgICAgICAgbGV0IGxpbWl0ID0gLXNwYW4uY2xpZW50V2lkdGggLSAxMDA7XG4gICAgICAgIGlmICh0aGlzLm5vd1BsYXlpbmdPZmZzZXQgPCBsaW1pdClcbiAgICAgICAge1xuICAgICAgICAgICAgLy8gVGhlIHdob2xlIG1lc3NhZ2UgaGFzIHBhc3NlZDogbGV0IGl0IHJlc3QgYXQgdGhlIGxlZnQgZWRnZVxuICAgICAgICAgICAgc3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLnNjcm9sbE5vd1BsYXlpbmcoKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGxvYWRBbGwoKTogdm9pZFxuICAgIHtcbiAgICAgICAgdHJ5XG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCByYXcgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSh0aGlzLnN0b3JhZ2VLZXkpO1xuICAgICAgICAgICAgbGV0IHBhcnNlZCA9IHJhdyA/IEpTT04ucGFyc2UocmF3KSBhcyBEYXNoU2NlbmFyaW9bXSA6IFtdO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHBhcnNlZCkpXG4gICAgICAgICAgICAgICAgcGFyc2VkID0gW107XG4gICAgICAgICAgICB0aGlzLnNjZW5hcmlvcyA9IHBhcnNlZDtcbiAgICAgICAgICAgIHRoaXMuc2NlbmFyaW9zLmZvckVhY2goc2MgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBpZiAoc2Muc3RlcHMpXG4gICAgICAgICAgICAgICAgICAgIHNjLnN0ZXBzLmZvckVhY2goc3QgPT4gdGhpcy5ub3JtYWxpemVTdGVwQnJhbmNoZXMoc3QpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnNjZW5hcmlvcyA9IFtdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWlncmF0ZSB0aGUgbGVnYWN5IHNpbmdsZSBicmFuY2ggb250byBicmFuY2hlc1tdIGFuZCBkcm9wIHJvd3MgdGhhdFxuICAgICAqIGFyZSBub3QgdXNhYmxlIGF0IHJ1biB0aW1lLiBSdW5zIG9uIGxvYWQgYW5kIGltcG9ydCBzbyB0aGUgcmVzdCBvZlxuICAgICAqIHRoZSBhcHAgb25seSBldmVyIHNlZXMgdGhlIG9yZGVyZWQtbGlzdCBzaGFwZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIG5vcm1hbGl6ZVN0ZXBCcmFuY2hlcyhzdDogRGFzaFN0ZXApOiB2b2lkXG4gICAge1xuICAgICAgICBpZiAoc3QuYnJhbmNoICYmICghc3QuYnJhbmNoZXMgfHwgc3QuYnJhbmNoZXMubGVuZ3RoID09PSAwKSlcbiAgICAgICAge1xuICAgICAgICAgICAgc3QuYnJhbmNoZXMgPSBbc3QuYnJhbmNoXTtcbiAgICAgICAgICAgIHN0LmJyYW5jaCA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc3QuYnJhbmNoZXMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBrZXB0ID0gc3QuYnJhbmNoZXMuZmlsdGVyKGIgPT4gYiAmJiB0eXBlb2YgYi5jb25kaXRpb24gPT09ICdzdHJpbmcnICYmIGIudGFyZ2V0ICE9PSB1bmRlZmluZWQpO1xuICAgICAgICAgICAgc3QuYnJhbmNoZXMgPSBrZXB0Lmxlbmd0aCA+IDAgPyBrZXB0IDogdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzYXZlQWxsKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKHRoaXMuc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkodGhpcy5zY2VuYXJpb3MpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGN1cnJlbnQoKTogRGFzaFNjZW5hcmlvIHwgbnVsbFxuICAgIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NlbmFyaW9zLmZpbmQocyA9PiBzLmlkID09PSB0aGlzLmN1cnJlbnRJZCkgfHwgbnVsbDtcbiAgICB9XG5cbiAgICAvKiogRXNjYXBlcyB1c2VyLWVudGVyZWQgdGV4dCBiZWZvcmUgaXQgaXMgaW50ZXJwb2xhdGVkIGludG8gSFRNTCAqL1xuICAgIHByaXZhdGUgZXNjKHY6IHN0cmluZyk6IHN0cmluZ1xuICAgIHtcbiAgICAgICAgcmV0dXJuIHYucmVwbGFjZSgvJi9nLCAnJmFtcDsnKS5yZXBsYWNlKC88L2csICcmbHQ7JykucmVwbGFjZSgvPi9nLCAnJmd0OycpLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcbiAgICB9XG5cbiAgICAvLyDilIDilIAgUGxheWJhY2sg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBwcml2YXRlIHN0YXJ0UGxheWJhY2soKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgaWYgKCFzIHx8IHMuc3RlcHMubGVuZ3RoID09PSAwKVxuICAgICAgICB7XG4gICAgICAgICAgICBhbGVydCgnVGhpcyBzY2VuYXJpbyBoYXMgbm8gc3RlcHMgeWV0LiBDYXB0dXJlIG9yIGFkZCBzb21lIGZpcnN0LicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXRFZGl0aW5nRW5hYmxlZChmYWxzZSk7XG4gICAgICAgIHRoaXMuc2V0UGxheWJhY2tBY3RpdmUodHJ1ZSk7XG5cbiAgICAgICAgUkFHLnNjZW5hcmlvLmNsZWFyKCk7XG4gICAgICAgIFJBRy5zY2VuYXJpby5zZXRTdGVwcyhzLnN0ZXBzIGFzIGFueSk7XG4gICAgICAgIFJBRy5zY2VuYXJpby5zZXRMb29wQ291bnQocy5sb29wQ291bnQpO1xuICAgICAgICBSQUcuc2NlbmFyaW8ucGxheSgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3RvcFBsYXliYWNrKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIFJBRy5zY2VuYXJpby5zdG9wKCk7XG4gICAgICAgIHRoaXMub25QbGF5YmFja0VuZGVkKCk7XG4gICAgICAgIHRoaXMuc2V0Tm93UGxheWluZygnUGxheWJhY2sgc3RvcHBlZC4nLCBmYWxzZSk7XG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCgnUGxheWJhY2sgc3RvcHBlZC4nKTtcbiAgICB9XG5cbiAgICAvKiogUGxheXMgYSBzaW5nbGUgc3RlcCBvbmNlIChhbm5vdW5jZW1lbnQgb3Igd2FpdCksIHRoZW4gc3RvcHMgKi9cbiAgICBwcml2YXRlIHBsYXlTdGVwT25seShpZHg6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgIGlmICghcyB8fCAhcy5zdGVwc1tpZHhdKVxuICAgICAgICB7XG4gICAgICAgICAgICBhbGVydCgnVGhpcyBzY2VuYXJpbyBoYXMgbm8gc3RlcHMgeWV0LiBDYXB0dXJlIG9yIGFkZCBzb21lIGZpcnN0LicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXRFZGl0aW5nRW5hYmxlZChmYWxzZSk7XG4gICAgICAgIHRoaXMuc2V0UGxheWJhY2tBY3RpdmUodHJ1ZSk7XG5cbiAgICAgICAgUkFHLnNjZW5hcmlvLmNsZWFyKCk7XG4gICAgICAgIFJBRy5zY2VuYXJpby5zZXRTdGVwcyhzLnN0ZXBzIGFzIGFueSk7XG4gICAgICAgIFJBRy5zY2VuYXJpby5wbGF5U3RlcChpZHgpO1xuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ1BsYXlpbmcgc3RlcCAnICsgKGlkeCArIDEpICsgJyBvbmx5LicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25QbGF5YmFja0VuZGVkKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc2V0UGxheWJhY2tBY3RpdmUoZmFsc2UpO1xuICAgICAgICB0aGlzLnNldEVkaXRpbmdFbmFibGVkKHRydWUpO1xuICAgICAgICB0aGlzLmhpZ2hsaWdodFN0ZXAoLTEpO1xuICAgICAgICB0aGlzLnVwZGF0ZVByb2dyZXNzKC0xLCAwKTtcbiAgICAgICAgdGhpcy5zZXROb3dQbGF5aW5nKCdJZGxlJywgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyb3NzLXRhYiBsb2NrLiBPdGhlciB0YWJzICh0aGUgZWRpdG9yIHJvbGUpIHJlYWQgcmFnLnBsYXliYWNrQWN0aXZlXG4gICAgICogYW5kIHJlYWN0IHRvIHRoZSBzdG9yYWdlIGV2ZW50OyB0aGUgaGVhcnRiZWF0IGtlZXBzIHRoZSBsb2NrIGZyZXNoIHNvXG4gICAgICogYSBjbG9zZWQgZGFzaGJvYXJkIHRhYiBjYW5ub3QgbGVhdmUgdGhlIGVkaXRvciBsb2NrZWQgZm9yZXZlci5cbiAgICAgKi9cbiAgICBwcml2YXRlIHNldFBsYXliYWNrQWN0aXZlKGFjdGl2ZTogYm9vbGVhbik6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmIChhY3RpdmUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcucGxheWJhY2tBY3RpdmUnLCAnMScpO1xuICAgICAgICAgICAgdGhpcy5wbGF5SGVhcnRiZWF0VGljaygpO1xuICAgICAgICAgICAgdGhpcy5wbGF5SGVhcnRiZWF0ID0gd2luZG93LnNldEludGVydmFsKCgpID0+IHRoaXMucGxheUhlYXJ0YmVhdFRpY2soKSwgNTAwMCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMucGxheUhlYXJ0YmVhdCk7XG4gICAgICAgICAgICB0aGlzLnBsYXlIZWFydGJlYXQgPSAwO1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ3JhZy5wbGF5YmFja0FjdGl2ZScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwbGF5SGVhcnRiZWF0VGljaygpOiB2b2lkXG4gICAge1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgncmFnLnBsYXliYWNrU2luY2UnLCBTdHJpbmcoRGF0ZS5ub3coKSkpO1xuICAgIH1cblxuICAgIC8qKiBMb2NrcyB0aGlzIHRhYidzIG93biBtYWluIHNjcmVlbiB3aGlsZSBhIHNjZW5hcmlvIGlzIHBsYXlpbmcgKi9cbiAgICBwcml2YXRlIHNldEVkaXRpbmdFbmFibGVkKG9uOiBib29sZWFuKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKFJBRy52aWV3cylcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYWluLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBvbiA/ICcnIDogJ25vbmUnO1xuXG4gICAgICAgIGxldCB0b29sYmFyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Rvb2xiYXInKTtcbiAgICAgICAgaWYgKHRvb2xiYXIpXG4gICAgICAgICAgICB0b29sYmFyLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBvbiA/ICcnIDogJ25vbmUnO1xuICAgIH1cblxuICAgIC8vIOKUgOKUgCBQcm9ncmVzcyBhbmQgaGlnaGxpZ2h0IOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgcHJpdmF0ZSB1cGRhdGVQcm9ncmVzcyhpZHg6IG51bWJlciwgdG90YWw6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICghdGhpcy5wcm9ncmVzc1RleHRFbCB8fCAhdGhpcy5wcm9ncmVzc0ZpbGxFbClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAoaWR4IDwgMClcbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5wcm9ncmVzc1RleHRFbC50ZXh0Q29udGVudCA9ICdJZGxlJztcbiAgICAgICAgICAgIHRoaXMucHJvZ3Jlc3NGaWxsRWwuc3R5bGUud2lkdGggPSAnMCUnO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHBjdCA9IHRvdGFsID4gMCA/IE1hdGgucm91bmQoKChpZHggKyAxKSAvIHRvdGFsKSAqIDEwMCkgOiAwO1xuICAgICAgICB0aGlzLnByb2dyZXNzVGV4dEVsLnRleHRDb250ZW50ID0gJ1N0ZXAgJyArIChpZHggKyAxKSArICcgb2YgJyArIHRvdGFsO1xuICAgICAgICB0aGlzLnByb2dyZXNzRmlsbEVsLnN0eWxlLndpZHRoID0gcGN0ICsgJyUnO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGlnaGxpZ2h0U3RlcChpZHg6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMucGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtc3RlcCcpLmZvckVhY2goKGVsLCBpKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBlbC5jbGFzc0xpc3QudG9nZ2xlKCdydW5uaW5nJywgaSA9PT0gaWR4KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSAIFJlbmRlcmluZyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuICAgIHB1YmxpYyByZW5kZXIoKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcblxuICAgICAgICBsZXQgbGlzdEh0bWwgPSB0aGlzLnNjZW5hcmlvcy5tYXAoc2MgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IGNscyA9IHNjLmlkID09PSB0aGlzLmN1cnJlbnRJZCA/ICdkYXNoLXNjZW4gYWN0aXZlJyA6ICdkYXNoLXNjZW4nO1xuICAgICAgICAgICAgcmV0dXJuIGA8bGkgY2xhc3M9XCIke2Nsc31cIiBkYXRhLWlkPVwiJHt0aGlzLmVzYyhzYy5pZCl9XCI+JHt0aGlzLmVzYyhzYy5uYW1lKX0gPHNwYW4gY2xhc3M9XCJkYXNoLXNjZW4tbWV0YVwiPiR7c2Muc3RlcHMubGVuZ3RofSBzdGVwczwvc3Bhbj48L2xpPmA7XG4gICAgICAgIH0pLmpvaW4oJycpO1xuXG4gICAgICAgIGxldCBzdGVwc0h0bWwgPSAnJztcbiAgICAgICAgaWYgKHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBzYyA9IHM7XG4gICAgICAgICAgICBzdGVwc0h0bWwgPSBzYy5zdGVwcy5tYXAoKHN0LCBpKSA9PiB0aGlzLnN0ZXBIdG1sKHNjLCBzdCwgaSkpLmpvaW4oJycpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wYW5lbC5pbm5lckhUTUwgPVxuICAgICAgICBgPGRpdiBjbGFzcz1cImRhc2hcIj5cbiAgICAgICAgICAgIDxoMT5TY2VuYXJpbyBEYXNoYm9hcmQ8L2gxPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcm93IGRhc2gtaGVhZFwiPlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoQ2xvc2VcIiB0eXBlPVwiYnV0dG9uXCIgdGl0bGU9XCJIaWRlIHRoZSBkYXNoYm9hcmQgcGFuZWwgYW5kIHNob3cgdGhlIGFubm91bmNlbWVudCBzY3JlZW5cIj5IaWRlIHBhbmVsPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPGgyPlNjZW5hcmlvczwvaDI+XG4gICAgICAgICAgICA8dWw+JHtsaXN0SHRtbH08L3VsPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcm93XCI+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImRhc2hOZXdcIiB0eXBlPVwiYnV0dG9uXCI+TmV3IHNjZW5hcmlvPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJkYXNoLWVkaXRvclwiPlxuICAgICAgICAgICAgICAgICR7cyA/IHRoaXMuZWRpdG9ySHRtbChzLCBzdGVwc0h0bWwpIDogJzxwIGNsYXNzPVwiZGFzaC1oaW50XCI+U2VsZWN0IGEgc2NlbmFyaW8gYWJvdmUsIG9yIGNyZWF0ZSBhIG5ldyBvbmUuPC9wPid9XG4gICAgICAgICAgICA8L3NlY3Rpb24+XG4gICAgICAgIDwvZGl2PmA7XG5cbiAgICAgICAgdGhpcy5wcm9ncmVzc1RleHRFbCA9IHRoaXMucGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hQcm9ncmVzc1RleHQnKTtcbiAgICAgICAgdGhpcy5wcm9ncmVzc0ZpbGxFbCA9IHRoaXMucGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hQcm9ncmVzc0ZpbGwnKTtcbiAgICAgICAgdGhpcy5iaW5kKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBlZGl0b3JIdG1sKHM6IERhc2hTY2VuYXJpbywgc3RlcHNIdG1sOiBzdHJpbmcpOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIGxldCBzdGVwc0xpc3QgPSBzdGVwc0h0bWwubGVuZ3RoID4gMFxuICAgICAgICAgICAgPyBzdGVwc0h0bWxcbiAgICAgICAgICAgIDogJzxwIGNsYXNzPVwiZGFzaC1oaW50XCI+Tm8gc3RlcHMgeWV0LiBDYXB0dXJlIHRoZSBjdXJyZW50IGFubm91bmNlbWVudCwgb3IgYWRkIGEgd2FpdCBzdGVwLjwvcD4nO1xuXG4gICAgICAgIHJldHVybiBgPGRpdiBjbGFzcz1cImRhc2gtcm93XCI+XG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiZGFzaC1maWVsZFwiPk5hbWUgPGlucHV0IGlkPVwiZGFzaE5hbWVcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt0aGlzLmVzYyhzLm5hbWUpfVwiPjwvbGFiZWw+XG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiZGFzaC1maWVsZFwiPkxvb3AgY291bnQgPGlucHV0IGlkPVwiZGFzaExvb3BcIiB0eXBlPVwibnVtYmVyXCIgdmFsdWU9XCIke3MubG9vcENvdW50fVwiIG1pbj1cIjFcIiB0aXRsZT1cIkhvdyBtYW55IHRpbWVzIHRvIHJlcGVhdCB0aGUgd2hvbGUgc2NlbmFyaW9cIj48L2xhYmVsPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1yb3dcIj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiZGFzaEFkZFN0ZXBcIiB0eXBlPVwiYnV0dG9uXCIgdGl0bGU9XCJBZGQgdGhlIGN1cnJlbnQgYW5ub3VuY2VtZW50IGFzIGEgc3RlcFwiPkNhcHR1cmUgc3RlcDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoQWRkV2FpdFwiIHR5cGU9XCJidXR0b25cIiB0aXRsZT1cIkFkZCBhIHNpbGVudCBwYXVzZVwiPkFkZCB3YWl0IHN0ZXA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiZGFzaEltcG9ydFwiIHR5cGU9XCJidXR0b25cIj5JbXBvcnQgSlNPTjwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoRXhwb3J0XCIgdHlwZT1cImJ1dHRvblwiPkV4cG9ydCBKU09OPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxoMj5TdGVwczwvaDI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1zdGVwc1wiPiR7c3RlcHNMaXN0fTwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcnVuXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtbm93cGxheWluZ1wiIGlkPVwiZGFzaE5vd1BsYXlpbmdcIj5JZGxlPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcm93XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoUGxheVwiIHR5cGU9XCJidXR0b25cIj5QbGF5PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoU3RvcFwiIHR5cGU9XCJidXR0b25cIj5TdG9wPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcHJvZ3Jlc3NcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJkYXNoUHJvZ3Jlc3NUZXh0XCI+SWRsZTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcHJvZ3Jlc3MtYmFyXCI+PGRpdiBjbGFzcz1cImRhc2gtcHJvZ3Jlc3MtZmlsbFwiIGlkPVwiZGFzaFByb2dyZXNzRmlsbFwiPjwvZGl2PjwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+YDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0ZXBIdG1sKHM6IERhc2hTY2VuYXJpbywgc3Q6IERhc2hTdGVwLCBpOiBudW1iZXIpOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIGxldCB0aXRsZSA9IHN0LnR5cGUgPT09ICd3YWl0JyA/ICgnV2FpdCAnICsgKHN0LndhaXRTZWNvbmRzIHx8IDApICsgJ3MnKSA6ICgnU3RlcCAnICsgKGkgKyAxKSk7XG4gICAgICAgIGxldCBicmFuY2hDb3VudCA9IChzdC5icmFuY2hlcyA/IHN0LmJyYW5jaGVzLmxlbmd0aCA6IDApICsgKHN0LmJyYW5jaCA/IDEgOiAwKTtcbiAgICAgICAgbGV0IGJyYW5jaFRhZyA9ICcnO1xuICAgICAgICBpZiAoYnJhbmNoQ291bnQgPT09IDEpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBiID0gKHN0LmJyYW5jaGVzICYmIHN0LmJyYW5jaGVzLmxlbmd0aCA+IDApID8gc3QuYnJhbmNoZXNbMF0gOiBzdC5icmFuY2g7XG4gICAgICAgICAgICBpZiAoYilcbiAgICAgICAgICAgICAgICBicmFuY2hUYWcgPSAnIDxzcGFuIGNsYXNzPVwiZGFzaC1icmFuY2gtdGFnXCI+4oaSICcgKyB0aGlzLmJyYW5jaFN1bW1hcnkoYikgKyAnPC9zcGFuPic7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoYnJhbmNoQ291bnQgPiAxKVxuICAgICAgICB7XG4gICAgICAgICAgICBicmFuY2hUYWcgPSAnIDxzcGFuIGNsYXNzPVwiZGFzaC1icmFuY2gtdGFnXCI+4oaSICcgKyBicmFuY2hDb3VudCArICcgYnJhbmNoZXM8L3NwYW4+JztcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBsYWJlbElucHV0ID0gYDxsYWJlbCBjbGFzcz1cImRhc2gtZmllbGRcIj5MYWJlbCA8aW5wdXQgY2xhc3M9XCJkYXNoLWxhYmVsXCIgdHlwZT1cInRleHRcIiBkYXRhLWlkeD1cIiR7aX1cIiB2YWx1ZT1cIiR7dGhpcy5lc2Moc3QubGFiZWwgfHwgJycpfVwiIHBsYWNlaG9sZGVyPVwib3B0aW9uYWxcIiB0aXRsZT1cIk9wdGlvbmFsIGxhYmVsOyBvdGhlciBzdGVwcyBjYW4gYnJhbmNoIHRvIGl0XCI+PC9sYWJlbD5gO1xuICAgICAgICBsZXQgZ2FwSW5wdXQgPSBzdC50eXBlID09PSAnYW5ub3VuY2VtZW50J1xuICAgICAgICAgICAgPyBgPGxhYmVsIGNsYXNzPVwiZGFzaC1maWVsZFwiPkdhcCAobXMpIDxpbnB1dCBjbGFzcz1cImRhc2gtZ2FwXCIgdHlwZT1cIm51bWJlclwiIGRhdGEtaWR4PVwiJHtpfVwiIHZhbHVlPVwiJHtzdC5nYXBNc31cIiBtaW49XCIwXCIgc3RlcD1cIjEwMFwiIHRpdGxlPVwiUGF1c2UgYWZ0ZXIgdGhpcyBzdGVwLCBpbiBtaWxsaXNlY29uZHNcIj48L2xhYmVsPmBcbiAgICAgICAgICAgIDogJyc7XG4gICAgICAgIGxldCB3YWl0SW5wdXQgPSBzdC50eXBlID09PSAnd2FpdCdcbiAgICAgICAgICAgID8gYDxsYWJlbCBjbGFzcz1cImRhc2gtZmllbGRcIj5XYWl0IChzKSA8aW5wdXQgY2xhc3M9XCJkYXNoLXdhaXRcIiB0eXBlPVwibnVtYmVyXCIgZGF0YS1pZHg9XCIke2l9XCIgdmFsdWU9XCIke3N0LndhaXRTZWNvbmRzIHx8IDB9XCIgbWluPVwiMFwiIHN0ZXA9XCIxXCIgdGl0bGU9XCJTaWxlbnQgcGF1c2UsIGluIHNlY29uZHNcIj48L2xhYmVsPmBcbiAgICAgICAgICAgIDogJyc7XG4gICAgICAgIGxldCBhbm5CdXR0b25zID0gc3QudHlwZSA9PT0gJ2Fubm91bmNlbWVudCdcbiAgICAgICAgICAgID8gYDxidXR0b24gY2xhc3M9XCJkYXNoLWVkaXRcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1pZHg9XCIke2l9XCIgdGl0bGU9XCJPcGVuIHRoaXMgc3RlcCBpbiB0aGUgZWRpdG9yIHRvIGNoYW5nZSBpdFwiPkVkaXQ8L2J1dHRvbj5cbiAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJkYXNoLWJyYW5jaC10b2dnbGVcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1pZHg9XCIke2l9XCIgdGl0bGU9XCJCcmFuY2g6IGp1bXAgZWxzZXdoZXJlIHdoZW4gYSBjb25kaXRpb24gaXMgbWV0XCI+QnJhbmNoPC9idXR0b24+YFxuICAgICAgICAgICAgOiAnJztcblxuICAgICAgICByZXR1cm4gYDxkaXYgY2xhc3M9XCJkYXNoLXN0ZXBcIiBkYXRhLWlkeD1cIiR7aX1cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkYXNoLXN0ZXAtdGl0bGVcIj48c3Bhbj4ke3RpdGxlfTwvc3Bhbj4ke2JyYW5jaFRhZ308L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkYXNoLXJvd1wiPlxuICAgICAgICAgICAgICAgICR7bGFiZWxJbnB1dH1cbiAgICAgICAgICAgICAgICAke2dhcElucHV0fVxuICAgICAgICAgICAgICAgICR7d2FpdElucHV0fVxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiZGFzaC1yb3ctYnRuc1wiPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGFzaC11cFwiIHR5cGU9XCJidXR0b25cIiBkYXRhLWlkeD1cIiR7aX1cIiB0aXRsZT1cIk1vdmUgdXBcIiAke2kgPT09IDAgPyAnZGlzYWJsZWQnIDogJyd9PuKGkTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGFzaC1kb3duXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtaWR4PVwiJHtpfVwiIHRpdGxlPVwiTW92ZSBkb3duXCIgJHtpID09PSBzLnN0ZXBzLmxlbmd0aCAtIDEgPyAnZGlzYWJsZWQnIDogJyd9PuKGkzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGFzaC1zdGVwcGxheVwiIHR5cGU9XCJidXR0b25cIiBkYXRhLWlkeD1cIiR7aX1cIiB0aXRsZT1cIlBsYXkgb25seSB0aGlzIHN0ZXBcIj7ilrY8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgJHthbm5CdXR0b25zfVxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGFzaC1kZWxcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1pZHg9XCIke2l9XCIgdGl0bGU9XCJEZWxldGUgdGhpcyBzdGVwXCI+4pyVPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAke3RoaXMuYnJhbmNoRWRpdG9ySWR4ID09PSBpID8gdGhpcy5icmFuY2hFZGl0b3JIdG1sKHMsIGkpIDogJyd9XG4gICAgICAgIDwvZGl2PmA7XG4gICAgfVxuXG4gICAgLyoqIEh1bWFuLXJlYWRhYmxlIG9uZS1saW5lciBzaG93biBuZXh0IHRvIHRoZSBzdGVwIHRpdGxlICovXG4gICAgcHJpdmF0ZSBicmFuY2hTdW1tYXJ5KGI6IERhc2hCcmFuY2gpOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIGxldCB0aHIgPSBiLnRocmVzaG9sZCA9PT0gdW5kZWZpbmVkID8gJycgOiAoJyAnICsgU3RyaW5nKGIudGhyZXNob2xkKSk7XG4gICAgICAgIGxldCB0YXJnZXQ6IHN0cmluZztcbiAgICAgICAgaWYgKGIudGFyZ2V0ID09PSAnZW5kJylcbiAgICAgICAgICAgIHRhcmdldCA9ICdlbmQnO1xuICAgICAgICBlbHNlIGlmICh0eXBlb2YgYi50YXJnZXQgPT09ICdudW1iZXInKVxuICAgICAgICAgICAgdGFyZ2V0ID0gJ3N0ZXAgJyArIChiLnRhcmdldCArIDEpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0YXJnZXQgPSAnbGFiZWwgXCInICsgYi50YXJnZXQgKyAnXCInO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmVzYyhiLmNvbmRpdGlvbiArIHRociArICcg4oaSICcgKyB0YXJnZXQpO1xuICAgIH1cblxuICAgIC8qKiBSZXNvbHZlcyB0aGUgc3BlYyBmb3IgYSBjb25kaXRpb24gaWQsIGZhbGxpbmcgYmFjayB0byB0aGUgZmlyc3Qgb25lICovXG4gICAgcHJpdmF0ZSBzcGVjRm9yKGNvbmQ6IHN0cmluZyk6IERhc2hCcmFuY2hTcGVjXG4gICAge1xuICAgICAgICBsZXQgc3BlYyA9IERBU0hfQlJBTkNIX0NPTkRJVElPTlMuZmlsdGVyKGMgPT4gYy5pZCA9PT0gY29uZClbMF07XG4gICAgICAgIHJldHVybiBzcGVjIHx8IERBU0hfQlJBTkNIX0NPTkRJVElPTlNbMF07XG4gICAgfVxuXG4gICAgLyoqIENvcGllcyBvbmUgYnJhbmNoIHNvIHN0YWdlZCBlZGl0cyBjYW5ub3QgbGVhayBpbnRvIHRoZSBsaXZlIHN0ZXAgKi9cbiAgICBwcml2YXRlIGNvcHlCcmFuY2goYjogRGFzaEJyYW5jaCk6IERhc2hCcmFuY2hcbiAgICB7XG4gICAgICAgIHJldHVybiB7IGNvbmRpdGlvbjogYi5jb25kaXRpb24sIHRocmVzaG9sZDogYi50aHJlc2hvbGQsIHByb2JhYmlsaXR5OiBiLnByb2JhYmlsaXR5LCB0YXJnZXQ6IGIudGFyZ2V0LCBsYWJlbDogYi5sYWJlbCB9O1xuICAgIH1cblxuICAgIC8qKiBTZWVkcyB0aGUgZWRpdG9yJ3Mgc3RhZ2VkIHJvd3MgZnJvbSBhIHN0ZXAncyBicmFuY2hlcyAob3Igb25lIGJsYW5rIHJvdykgKi9cbiAgICBwcml2YXRlIHNlZWRCcmFuY2hSb3dzKHN0OiBEYXNoU3RlcCB8IHVuZGVmaW5lZCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCByb3dzOiBEYXNoQnJhbmNoW10gPSBbXTtcbiAgICAgICAgaWYgKHN0KVxuICAgICAgICB7XG4gICAgICAgICAgICBpZiAoc3QuYnJhbmNoZXMpXG4gICAgICAgICAgICAgICAgcm93cyA9IHN0LmJyYW5jaGVzLm1hcChiID0+IHRoaXMuY29weUJyYW5jaChiKSk7XG4gICAgICAgICAgICBlbHNlIGlmIChzdC5icmFuY2gpXG4gICAgICAgICAgICAgICAgcm93cyA9IFt0aGlzLmNvcHlCcmFuY2goc3QuYnJhbmNoKV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvd3MubGVuZ3RoID09PSAwKVxuICAgICAgICAgICAgcm93cyA9IFt7IGNvbmRpdGlvbjogJ2RlbGF5JywgdGhyZXNob2xkOiB1bmRlZmluZWQsIHRhcmdldDogJ2VuZCcgfV07XG4gICAgICAgIHRoaXMuYnJhbmNoRWRpdG9yUm93cyA9IHJvd3M7XG4gICAgICAgIHRoaXMuYnJhbmNoTmV3Q29uZCA9ICdkZWxheSc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBicmFuY2hFZGl0b3JIdG1sKHM6IERhc2hTY2VuYXJpbywgaTogbnVtYmVyKTogc3RyaW5nXG4gICAge1xuICAgICAgICBsZXQgcm93cyA9IHRoaXMuYnJhbmNoRWRpdG9yUm93cztcbiAgICAgICAgbGV0IHJvd0h0bWwgPSByb3dzLm1hcCgoYiwgaykgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IHNwZWMgPSB0aGlzLnNwZWNGb3IoYi5jb25kaXRpb24pO1xuICAgICAgICAgICAgbGV0IHRociA9IGIudGhyZXNob2xkID09PSB1bmRlZmluZWQgPyAnJyA6IFN0cmluZyhiLnRocmVzaG9sZCk7XG4gICAgICAgICAgICBsZXQgY29uZE9wdHMgPSBEQVNIX0JSQU5DSF9DT05ESVRJT05TLm1hcChjID0+XG4gICAgICAgICAgICAgICAgYDxvcHRpb24gdmFsdWU9XCIke2MuaWR9XCIgJHtjLmlkID09PSBiLmNvbmRpdGlvbiA/ICdzZWxlY3RlZCcgOiAnJ30+JHtjLmxhYmVsfTwvb3B0aW9uPmBcbiAgICAgICAgICAgICkuam9pbignJyk7XG5cbiAgICAgICAgICAgIGxldCB0aHJBdHRycyA9IHNwZWMuaW5wdXQgPT09ICdudW1iZXInXG4gICAgICAgICAgICAgICAgPyBgdHlwZT1cIm51bWJlclwiIG1pbj1cIiR7c3BlYy5taW4gfHwgJzAnfVwiICR7c3BlYy5tYXggIT09IHVuZGVmaW5lZCA/ICdtYXg9XCInICsgc3BlYy5tYXggKyAnXCInIDogJyd9YFxuICAgICAgICAgICAgICAgIDogYHR5cGU9XCJ0ZXh0XCIgcGxhY2Vob2xkZXI9XCIke3RoaXMuZXNjKHNwZWMucGxhY2Vob2xkZXIgfHwgJycpfVwiYDtcblxuICAgICAgICAgICAgcmV0dXJuIGA8ZGl2IGNsYXNzPVwiZGFzaC1icmFuY2gtcm93XCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcm93XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJkYXNoLWJyYW5jaC1jb25kXCIgZGF0YS1yb3c9XCIke2t9XCIgdGl0bGU9XCJCcmFuY2ggY29uZGl0aW9uXCI+JHtjb25kT3B0c308L3NlbGVjdD5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiZGFzaC1icmFuY2gtdGhyXCIgZGF0YS1yb3c9XCIke2t9XCIgdmFsdWU9XCIke3RoaXMuZXNjKHRocil9XCIgJHt0aHJBdHRyc30gdGl0bGU9XCJWYWx1ZSBmb3IgdGhpcyBjb25kaXRpb25cIj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1yb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImRhc2gtYnJhbmNoLXRhcmdldFwiIGRhdGEtcm93PVwiJHtrfVwiIHRpdGxlPVwiV2hlcmUgdG8ganVtcCB0b1wiPiR7dGhpcy50YXJnZXRPcHRpb25zKHMsIGIpfTwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImRhc2gtcm93LWJ0bnNcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJkYXNoLWJyYW5jaC11cFwiIHR5cGU9XCJidXR0b25cIiBkYXRhLXJvdz1cIiR7a31cIiB0aXRsZT1cIkhpZ2hlciBwcmlvcml0eSAoY2hlY2tlZCBlYXJsaWVyKVwiICR7ayA+IDAgPyAnJyA6ICdkaXNhYmxlZCd9PuKGkTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRhc2gtYnJhbmNoLWRvd25cIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1yb3c9XCIke2t9XCIgdGl0bGU9XCJMb3dlciBwcmlvcml0eSAoY2hlY2tlZCBsYXRlcilcIiAke2sgPCByb3dzLmxlbmd0aCAtIDEgPyAnJyA6ICdkaXNhYmxlZCd9PuKGkzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRhc2gtYnJhbmNoLWRlbFwiIHR5cGU9XCJidXR0b25cIiBkYXRhLXJvdz1cIiR7a31cIiB0aXRsZT1cIlJlbW92ZSB0aGlzIGJyYW5jaFwiPuKclTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5gO1xuICAgICAgICB9KS5qb2luKCcnKTtcblxuICAgICAgICBsZXQgbmV3T3B0cyA9IERBU0hfQlJBTkNIX0NPTkRJVElPTlMubWFwKGMgPT5cbiAgICAgICAgICAgIGA8b3B0aW9uIHZhbHVlPVwiJHtjLmlkfVwiICR7Yy5pZCA9PT0gdGhpcy5icmFuY2hOZXdDb25kID8gJ3NlbGVjdGVkJyA6ICcnfT4ke2MubGFiZWx9PC9vcHRpb24+YFxuICAgICAgICApLmpvaW4oJycpO1xuXG4gICAgICAgIHJldHVybiBgPGRpdiBjbGFzcz1cImRhc2gtYnJhbmNoLWVkaXRvclwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtYnJhbmNoLWhpbnRcIj5JZiAvIGVsaWY6IGJyYW5jaGVzIGFyZSBjaGVja2VkIHRvcCB0byBib3R0b20gYW5kIHRoZSBmaXJzdCBtYXRjaCB3aW5zLiBJZiBub25lIG1hdGNoLCB0aGUgc2NlbmFyaW8gY29udGludWVzIHdpdGggdGhlIG5leHQgc3RlcCAoZWxzZSkuPC9kaXY+XG4gICAgICAgICAgICAke3Jvd0h0bWx9XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1yb3dcIj5cbiAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZGFzaC1icmFuY2gtbmV3Y29uZFwiIHRpdGxlPVwiQ29uZGl0aW9uIGZvciB0aGUgbmV3IGJyYW5jaFwiPiR7bmV3T3B0c308L3NlbGVjdD5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGFzaC1icmFuY2gtYWRkXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtaWR4PVwiJHtpfVwiPisgQWRkIGJyYW5jaDwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZGFzaC1yb3dcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImRhc2gtcm93LWJ0bnNcIj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRhc2gtYnJhbmNoLXNhdmVcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1pZHg9XCIke2l9XCI+U2F2ZSBhbGw8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRhc2gtYnJhbmNoLWNhbmNlbFwiIHR5cGU9XCJidXR0b25cIj5DYW5jZWw8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+YDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUYXJnZXQgb3B0aW9uczogXCJlbmRcIiwgZXZlcnkgc3RlcCBieSBpbmRleCwgYW5kIGV2ZXJ5IGxhYmVsbGVkIHN0ZXAgYnlcbiAgICAgKiBsYWJlbC4gSW5kZXggb3B0aW9ucyBhcmUgc3RvcmVkIDAtYmFzZWQ7IGxhYmVsIG9wdGlvbnMgYXMgdGhlIGxhYmVsLlxuICAgICAqL1xuICAgIHByaXZhdGUgdGFyZ2V0T3B0aW9ucyhzOiBEYXNoU2NlbmFyaW8sIGI6IERhc2hCcmFuY2ggfCB1bmRlZmluZWQpOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIGxldCBjdXIgPSBiID8gU3RyaW5nKGIudGFyZ2V0KSA6ICdlbmQnO1xuICAgICAgICBsZXQgb3B0cyA9IFsnPG9wdGlvbiB2YWx1ZT1cImVuZFwiJyArIChjdXIgPT09ICdlbmQnID8gJyBzZWxlY3RlZCcgOiAnJykgKyAnPuKGkiBlbmQgb2Ygc2NlbmFyaW88L29wdGlvbj4nXTtcblxuICAgICAgICBzLnN0ZXBzLmZvckVhY2goKHN0LCBqKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBvcHRzLnB1c2goYDxvcHRpb24gdmFsdWU9XCJpZHg6JHtqfVwiICR7Y3VyID09PSAnaWR4OicgKyBqID8gJyBzZWxlY3RlZCcgOiAnJ30+4oaSIHN0ZXAgJHtqICsgMX0ke3N0LmxhYmVsID8gJyAoJyArIHRoaXMuZXNjKHN0LmxhYmVsKSArICcpJyA6ICcnfTwvb3B0aW9uPmApO1xuICAgICAgICAgICAgaWYgKHN0LmxhYmVsKVxuICAgICAgICAgICAgICAgIG9wdHMucHVzaChgPG9wdGlvbiB2YWx1ZT1cImxhYmVsOiR7dGhpcy5lc2Moc3QubGFiZWwpfVwiICR7Y3VyID09PSAnbGFiZWw6JyArIHN0LmxhYmVsID8gJyBzZWxlY3RlZCcgOiAnJ30+4oaSIGxhYmVsIFwiJHt0aGlzLmVzYyhzdC5sYWJlbCl9XCI8L29wdGlvbj5gKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gSG9ub3VyIGEgbGFiZWwgdGFyZ2V0IHRoYXQgbm8gbG9uZ2VyIG1hdGNoZXMgYW55IHN0ZXAgKGl0IGZhbGxzXG4gICAgICAgIC8vIGJhY2sgdG8gXCJlbmRcIiBhdCBydW4gdGltZSlcbiAgICAgICAgaWYgKGIgJiYgdHlwZW9mIGIudGFyZ2V0ID09PSAnc3RyaW5nJyAmJiBiLnRhcmdldCAhPT0gJ2VuZCcgJiYgIXMuc3RlcHMuc29tZShzdCA9PiBzdC5sYWJlbCA9PT0gYi50YXJnZXQpKVxuICAgICAgICAgICAgb3B0cy5wdXNoKGA8b3B0aW9uIHZhbHVlPVwibGFiZWw6JHt0aGlzLmVzYyhiLnRhcmdldCl9XCIgc2VsZWN0ZWQ+4oaSIGxhYmVsIFwiJHt0aGlzLmVzYyhiLnRhcmdldCl9XCIgKG5vdCBmb3VuZCk8L29wdGlvbj5gKTtcblxuICAgICAgICByZXR1cm4gb3B0cy5qb2luKCcnKTtcbiAgICB9XG5cbiAgICAvLyDilIDilIAgRXZlbnQgYmluZGluZyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuICAgIHByaXZhdGUgYmluZCgpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgcGFuZWwgPSB0aGlzLnBhbmVsO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLXNjZW4nKS5mb3JFYWNoKGxpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChsaSBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudElkID0gKGxpIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0WydpZCddIHx8IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudElkKVxuICAgICAgICAgICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgncmFnLmN1cnJlbnRTY2VuYXJpb0lkJywgdGhpcy5jdXJyZW50SWQpO1xuICAgICAgICAgICAgICAgIHRoaXMuYnJhbmNoRWRpdG9ySWR4ID0gLTE7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgYnRuQ2xvc2UgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaENsb3NlJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuQ2xvc2UpXG4gICAgICAgICAgICBidG5DbG9zZS5vbmNsaWNrID0gKCkgPT4geyB0aGlzLnBhbmVsLmhpZGRlbiA9IHRydWU7IH07XG5cbiAgICAgICAgbGV0IGJ0bk5ldyA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoTmV3JykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuTmV3KVxuICAgICAgICAgICAgYnRuTmV3Lm9uY2xpY2sgPSAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCBpZCA9ICdzY25fJyArIERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zY2VuYXJpb3MucHVzaCh7IGlkOiBpZCwgbmFtZTogJ1NjZW5hcmlvICcgKyAodGhpcy5zY2VuYXJpb3MubGVuZ3RoICsgMSksIHN0ZXBzOiBbXSwgbG9vcENvdW50OiAxLCBjcmVhdGVkQXQ6IERhdGUubm93KCksIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRJZCA9IGlkO1xuICAgICAgICAgICAgICAgIHRoaXMuYnJhbmNoRWRpdG9ySWR4ID0gLTE7XG4gICAgICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3JhZy5jdXJyZW50U2NlbmFyaW9JZCcsIGlkKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICBsZXQgYnRuQWRkID0gcGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hBZGRTdGVwJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuQWRkKVxuICAgICAgICAgICAgYnRuQWRkLm9uY2xpY2sgPSAoKSA9PiB0aGlzLmNhcHR1cmVTdGVwKCk7XG5cbiAgICAgICAgbGV0IGJ0bldhaXQgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaEFkZFdhaXQnKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChidG5XYWl0KVxuICAgICAgICAgICAgYnRuV2FpdC5vbmNsaWNrID0gKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICAgICAgICAgIGlmICghcylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHMuc3RlcHMucHVzaCh7IHR5cGU6ICd3YWl0JywgZ2FwTXM6IDAsIHdhaXRTZWNvbmRzOiAzIH0pO1xuICAgICAgICAgICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC11cCcpLmZvckVhY2goYiA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAoYiBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLm1vdmVTdGVwKGIgYXMgSFRNTEVsZW1lbnQsIC0xKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLWRvd24nKS5mb3JFYWNoKGIgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGIgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5tb3ZlU3RlcChiIGFzIEhUTUxFbGVtZW50LCAxKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLWRlbCcpLmZvckVhY2goYiA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAoYiBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLmRlbGV0ZVN0ZXAoYiBhcyBIVE1MRWxlbWVudCkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1lZGl0JykuZm9yRWFjaChiID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChiIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuZWRpdFN0ZXAocGFyc2VJbnQoKGIgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ2lkeCddIHx8ICcwJywgMTApKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLWJyYW5jaC10b2dnbGUnKS5mb3JFYWNoKGIgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGIgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoKGIgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ2lkeCddIHx8ICcwJywgMTApO1xuICAgICAgICAgICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFzKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgdGhpcy5icmFuY2hFZGl0b3JJZHggPSBpZHg7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWVkQnJhbmNoUm93cyhzLnN0ZXBzW2lkeF0pO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtYnJhbmNoLWNvbmQnKS5mb3JFYWNoKHNlbCA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAoc2VsIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCByb3cgPSBwYXJzZUludCgoc2VsIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0Wydyb3cnXSB8fCAnMCcsIDEwKTtcbiAgICAgICAgICAgICAgICBsZXQgciA9IHRoaXMuYnJhbmNoRWRpdG9yUm93c1tyb3ddO1xuICAgICAgICAgICAgICAgIGlmICghcilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHIuY29uZGl0aW9uID0gKHNlbCBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgLy8gVGhlIG1lYW5pbmcgb2YgdGhlIHZhbHVlIGRlcGVuZHMgb24gdGhlIGNvbmRpdGlvbiwgc28gc3RhcnRcbiAgICAgICAgICAgICAgICAvLyB0aGUgcm93J3MgdmFsdWUgZnJlc2ggaW5zdGVhZCBvZiBjYXJyeWluZyB0aGUgb2xkIG9uZSBvdmVyLlxuICAgICAgICAgICAgICAgIHIudGhyZXNob2xkID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHIucHJvYmFiaWxpdHkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1icmFuY2gtdGhyJykuZm9yRWFjaChpbnAgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGlucCBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgcm93ID0gcGFyc2VJbnQoKGlucCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldFsncm93J10gfHwgJzAnLCAxMCk7XG4gICAgICAgICAgICAgICAgbGV0IHIgPSB0aGlzLmJyYW5jaEVkaXRvclJvd3Nbcm93XTtcbiAgICAgICAgICAgICAgICBpZiAoIXIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBsZXQgdiA9IChpbnAgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmICh2ID09PSAnJylcbiAgICAgICAgICAgICAgICAgICAgci50aHJlc2hvbGQgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAodGhpcy5zcGVjRm9yKHIuY29uZGl0aW9uKS5pbnB1dCA9PT0gJ251bWJlcicpXG4gICAgICAgICAgICAgICAgICAgIHIudGhyZXNob2xkID0gcGFyc2VGbG9hdCh2KTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHIudGhyZXNob2xkID0gdjtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLWJyYW5jaC10YXJnZXQnKS5mb3JFYWNoKHNlbCA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAoc2VsIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCByb3cgPSBwYXJzZUludCgoc2VsIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0Wydyb3cnXSB8fCAnMCcsIDEwKTtcbiAgICAgICAgICAgICAgICBsZXQgciA9IHRoaXMuYnJhbmNoRWRpdG9yUm93c1tyb3ddO1xuICAgICAgICAgICAgICAgIGlmICghcilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGxldCByYXcgPSAoc2VsIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAocmF3ID09PSAnZW5kJylcbiAgICAgICAgICAgICAgICAgICAgci50YXJnZXQgPSAnZW5kJztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChyYXcuaW5kZXhPZignaWR4OicpID09PSAwKVxuICAgICAgICAgICAgICAgICAgICByLnRhcmdldCA9IHBhcnNlSW50KHJhdy5zdWJzdHJpbmcoNCksIDEwKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHIudGFyZ2V0ID0gcmF3LnN1YnN0cmluZyg2KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgbmV3Q29uZCA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJy5kYXNoLWJyYW5jaC1uZXdjb25kJyk7XG4gICAgICAgIGlmIChuZXdDb25kKVxuICAgICAgICB7XG4gICAgICAgICAgICBuZXdDb25kLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5icmFuY2hOZXdDb25kID0gKG5ld0NvbmQgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1icmFuY2gtYWRkJykuZm9yRWFjaChiID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChiIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5icmFuY2hFZGl0b3JSb3dzLnB1c2goeyBjb25kaXRpb246IHRoaXMuYnJhbmNoTmV3Q29uZCwgdGhyZXNob2xkOiB1bmRlZmluZWQsIHRhcmdldDogJ2VuZCcgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1icmFuY2gtdXAnKS5mb3JFYWNoKGIgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGIgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVCcmFuY2hSb3cocGFyc2VJbnQoKGIgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ3JvdyddIHx8ICcwJywgMTApLCAtMSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtYnJhbmNoLWRvd24nKS5mb3JFYWNoKGIgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGIgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVCcmFuY2hSb3cocGFyc2VJbnQoKGIgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ3JvdyddIHx8ICcwJywgMTApLCAxKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1icmFuY2gtZGVsJykuZm9yRWFjaChiID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChiIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IGsgPSBwYXJzZUludCgoYiBhcyBIVE1MRWxlbWVudCkuZGF0YXNldFsncm93J10gfHwgJzAnLCAxMCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYnJhbmNoRWRpdG9yUm93cy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJyYW5jaEVkaXRvclJvd3Muc3BsaWNlKGssIDEpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtYnJhbmNoLXNhdmUnKS5mb3JFYWNoKGIgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGIgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zYXZlQnJhbmNoKHBhcnNlSW50KChiIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0WydpZHgnXSB8fCAnMCcsIDEwKSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFzaC1icmFuY2gtY2FuY2VsJykuZm9yRWFjaChiID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChiIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5icmFuY2hFZGl0b3JJZHggPSAtMTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLXN0ZXBwbGF5JykuZm9yRWFjaChiID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChiIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KChiIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0WydpZHgnXSB8fCAnMCcsIDEwKTtcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlTdGVwT25seShpZHgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLWxhYmVsJykuZm9yRWFjaChpbnAgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGlucCBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoKGlucCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldFsnaWR4J10gfHwgJzAnLCAxMCk7XG4gICAgICAgICAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBzLnN0ZXBzW2lkeF0ubGFiZWwgPSAoaW5wIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLWdhcCcpLmZvckVhY2goaW5wID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChpbnAgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KChpbnAgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ2lkeCddIHx8ICcwJywgMTApO1xuICAgICAgICAgICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFzKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgcy5zdGVwc1tpZHhdLmdhcE1zID0gcGFyc2VJbnQoKGlucCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSwgMTApIHx8IDA7XG4gICAgICAgICAgICAgICAgcy51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZUFsbCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLXdhaXQnKS5mb3JFYWNoKGlucCA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAoaW5wIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCBpZHggPSBwYXJzZUludCgoaW5wIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0WydpZHgnXSB8fCAnMCcsIDEwKTtcbiAgICAgICAgICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICAgICAgICAgIGlmICghcylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHMuc3RlcHNbaWR4XS53YWl0U2Vjb25kcyA9IHBhcnNlSW50KChpbnAgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUsIDEwKSB8fCAwO1xuICAgICAgICAgICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBuYW1lSW5wdXQgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaE5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKG5hbWVJbnB1dClcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IGVsID0gbmFtZUlucHV0O1xuICAgICAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICAgICAgICAgIGlmICghcylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHMubmFtZSA9IGVsLnZhbHVlO1xuICAgICAgICAgICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgbG9vcElucHV0ID0gcGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hMb29wJykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChsb29wSW5wdXQpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBlbCA9IGxvb3BJbnB1dDtcbiAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBzLmxvb3BDb3VudCA9IHBhcnNlSW50KGVsLnZhbHVlLCAxMCkgfHwgMTtcbiAgICAgICAgICAgICAgICBzLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBidG5QbGF5ID0gcGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hQbGF5JykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuUGxheSlcbiAgICAgICAgICAgIGJ0blBsYXkub25jbGljayA9ICgpID0+IHRoaXMuc3RhcnRQbGF5YmFjaygpO1xuXG4gICAgICAgIGxldCBidG5TdG9wID0gcGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hTdG9wJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuU3RvcClcbiAgICAgICAgICAgIGJ0blN0b3Aub25jbGljayA9ICgpID0+IHRoaXMuc3RvcFBsYXliYWNrKCk7XG5cbiAgICAgICAgbGV0IGJ0bkV4cG9ydCA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoRXhwb3J0JykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuRXhwb3J0KVxuICAgICAgICAgICAgYnRuRXhwb3J0Lm9uY2xpY2sgPSAoKSA9PiB0aGlzLmV4cG9ydEpzb24oKTtcblxuICAgICAgICBsZXQgYnRuSW1wb3J0ID0gcGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hJbXBvcnQnKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChidG5JbXBvcnQpXG4gICAgICAgICAgICBidG5JbXBvcnQub25jbGljayA9ICgpID0+IHRoaXMuaW1wb3J0SnNvbigpO1xuICAgIH1cblxuICAgIC8vIOKUgOKUgCBTdGVwIG9wZXJhdGlvbnMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIHRoZSBsaXZlIGFubm91bmNlbWVudCBhcyBhIG5ldyBzdGVwLiBQcmVmZXJzIGEgc2libGluZyB0YWIncyBzdGF0ZVxuICAgICAqIChhc2tlZCBmb3Igb3ZlciB0aGUgY2hhbm5lbCwgYW5zd2VyZWQgYnkgdGhlIGVkaXRvciByb2xlKTsgZmFsbHMgYmFja1xuICAgICAqIHRvIHRoaXMgdGFiJ3Mgb3duIHN0YXRlIHdoZW4gbm8gb3RoZXIgdGFiIGFuc3dlcnMgd2l0aGluIDEuMnMgKGkuZS5cbiAgICAgKiBidWlsZGluZyBkaXJlY3RseSBvbiB0aGUgZGFzaGJvYXJkIHBhZ2UpLlxuICAgICAqL1xuICAgIHByaXZhdGUgY2FwdHVyZVN0ZXAoKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IGNhcHR1cmVkID0gZmFsc2U7XG4gICAgICAgIGxldCBub25jZSA9ICdjYXBfJyArIERhdGUubm93KCkgKyAnXycgKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKTtcblxuICAgICAgICBsZXQgaGFuZGxlciA9IChtc2c6IGFueSkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKGNhcHR1cmVkIHx8ICFtc2cgfHwgbXNnLm5vbmNlICE9PSBub25jZSB8fCAhbXNnLnN0YXRlSnNvbilcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBjYXB0dXJlZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAoUkFHLmNoYW5uZWwpXG4gICAgICAgICAgICAgICAgUkFHLmNoYW5uZWwub2ZmKCdDQVBUVVJFRF9TVEVQX0RBVEEnLCBoYW5kbGVyKTtcbiAgICAgICAgICAgIHRoaXMucHVzaFN0ZXAobXNnLnN0YXRlSnNvbik7XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKFJBRy5jaGFubmVsKVxuICAgICAgICB7XG4gICAgICAgICAgICBSQUcuY2hhbm5lbC5vbignQ0FQVFVSRURfU1RFUF9EQVRBJywgaGFuZGxlcik7XG4gICAgICAgICAgICBSQUcuY2hhbm5lbC5zZW5kKCdDQVBUVVJFX1NURVBfUkVRVUVTVCcsIHsgbm9uY2U6IG5vbmNlIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKFJBRy5jaGFubmVsKVxuICAgICAgICAgICAgICAgIFJBRy5jaGFubmVsLm9mZignQ0FQVFVSRURfU1RFUF9EQVRBJywgaGFuZGxlcik7XG4gICAgICAgICAgICBpZiAoIWNhcHR1cmVkKVxuICAgICAgICAgICAgICAgIHRoaXMucHVzaFN0ZXAoSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKSk7XG4gICAgICAgIH0sIDEyMDApO1xuICAgIH1cblxuICAgIHByaXZhdGUgcHVzaFN0ZXAoc3RhdGVKc29uOiBzdHJpbmcpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICBpZiAoIXMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGFsZXJ0KCdTZWxlY3QgYSBzY2VuYXJpbyBmaXJzdC4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHMuc3RlcHMucHVzaCh7IHR5cGU6ICdhbm5vdW5jZW1lbnQnLCBzdGF0ZUpzb246IHN0YXRlSnNvbiwgZ2FwTXM6IDE1MDAgfSk7XG4gICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCgnQ2FwdHVyZWQgc3RlcCAnICsgcy5zdGVwcy5sZW5ndGggKyAnIGludG8gXCInICsgcy5uYW1lICsgJ1wiJyk7XG4gICAgfVxuXG4gICAgLyoqIE9wZW5zIHRoZSBlZGl0b3Igcm9sZSBpbiBhIG5ldyB0YWIgd2l0aCB0aGlzIHN0ZXAgbG9hZGVkIGZvciBlZGl0aW5nICovXG4gICAgcHJpdmF0ZSBlZGl0U3RlcChpZHg6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgIGlmICghcyB8fCAhcy5zdGVwc1tpZHhdKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAocy5zdGVwc1tpZHhdLnR5cGUgIT09ICdhbm5vdW5jZW1lbnQnIHx8ICFzLnN0ZXBzW2lkeF0uc3RhdGVKc29uKVxuICAgICAgICB7XG4gICAgICAgICAgICBhbGVydCgnVGhpcyBzdGVwIGhhcyBubyBhbm5vdW5jZW1lbnQgc3RhdGUgdG8gZWRpdC4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcuY3VycmVudFNjZW5hcmlvSWQnLCBzLmlkKTtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3JhZy5zZWxlY3RlZFN0ZXBJbmRleCcsIFN0cmluZyhpZHgpKTtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3JhZy5lZGl0UmVxdWVzdCcsICcxJyk7XG4gICAgICAgIHdpbmRvdy5vcGVuKCdpbmRleC5odG1sJywgJ19ibGFuaycpO1xuICAgIH1cblxuICAgIHByaXZhdGUgbW92ZVN0ZXAoYnRuOiBIVE1MRWxlbWVudCwgZGlyOiBudW1iZXIpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoYnRuLmRhdGFzZXRbJ2lkeCddIHx8ICcwJywgMTApO1xuICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGxldCB0byA9IGlkeCArIGRpcjtcbiAgICAgICAgaWYgKHRvIDwgMCB8fCB0byA+PSBzLnN0ZXBzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBsZXQgdG1wID0gcy5zdGVwc1t0b107XG4gICAgICAgIHMuc3RlcHNbdG9dID0gcy5zdGVwc1tpZHhdO1xuICAgICAgICBzLnN0ZXBzW2lkeF0gPSB0bXA7XG4gICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkZWxldGVTdGVwKGJ0bjogSFRNTEVsZW1lbnQpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoYnRuLmRhdGFzZXRbJ2lkeCddIHx8ICcwJywgMTApO1xuICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmICghY29uZmlybSgnRGVsZXRlIHRoaXMgc3RlcD8nKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBzLnN0ZXBzLnNwbGljZShpZHgsIDEpO1xuICAgICAgICBzLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIGlmICh0aGlzLmJyYW5jaEVkaXRvcklkeCA9PT0gaWR4KVxuICAgICAgICAgICAgdGhpcy5icmFuY2hFZGl0b3JJZHggPSAtMTtcbiAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgLyoqIFN3YXBzIGEgc3RhZ2VkIGJyYW5jaCByb3cgd2l0aCBpdHMgbmVpZ2hib3VyIChyZW9yZGVyIHByaW9yaXR5KSAqL1xuICAgIHByaXZhdGUgbW92ZUJyYW5jaFJvdyhrOiBudW1iZXIsIGRpcjogbnVtYmVyKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IGogPSBrICsgZGlyO1xuICAgICAgICBpZiAoaiA8IDAgfHwgaiA+PSB0aGlzLmJyYW5jaEVkaXRvclJvd3MubGVuZ3RoIHx8IGsgPCAwIHx8IGsgPj0gdGhpcy5icmFuY2hFZGl0b3JSb3dzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgbGV0IHRtcCA9IHRoaXMuYnJhbmNoRWRpdG9yUm93c1trXTtcbiAgICAgICAgdGhpcy5icmFuY2hFZGl0b3JSb3dzW2tdID0gdGhpcy5icmFuY2hFZGl0b3JSb3dzW2pdO1xuICAgICAgICB0aGlzLmJyYW5jaEVkaXRvclJvd3Nbal0gPSB0bXA7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgLyoqIFZhbGlkYXRlcyBldmVyeSBzdGFnZWQgcm93OyByZXR1cm5zIGFuIGVycm9yIG1lc3NhZ2Ugb3IgbnVsbCB3aGVuIGFsbCBhcmUgdXNhYmxlICovXG4gICAgcHJpdmF0ZSBicmFuY2hSb3dzRXJyb3IoKTogc3RyaW5nIHwgbnVsbFxuICAgIHtcbiAgICAgICAgZm9yIChsZXQgayA9IDA7IGsgPCB0aGlzLmJyYW5jaEVkaXRvclJvd3MubGVuZ3RoOyBrKyspXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBiID0gdGhpcy5icmFuY2hFZGl0b3JSb3dzW2tdO1xuICAgICAgICAgICAgbGV0IHNwZWMgPSB0aGlzLnNwZWNGb3IoYi5jb25kaXRpb24pO1xuICAgICAgICAgICAgaWYgKHNwZWMuaW5wdXQgPT09ICdudW1iZXInKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGlmIChiLnRocmVzaG9sZCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBiLnRocmVzaG9sZCAhPT0gJ251bWJlcicgfHwgaXNOYU4oYi50aHJlc2hvbGQpKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ0JyYW5jaCAnICsgKGsgKyAxKSArICc6IGVudGVyIGEgbnVtYmVyIGZvciB0aGUgY29uZGl0aW9uLCBvciByZW1vdmUgdGhhdCBicmFuY2guJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBpZiAoYi50aHJlc2hvbGQgPT09IHVuZGVmaW5lZCB8fCBTdHJpbmcoYi50aHJlc2hvbGQpLnRyaW0oKSA9PT0gJycpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnQnJhbmNoICcgKyAoayArIDEpICsgJzogZW50ZXIgYSB2YWx1ZSBmb3IgdGhlIGNvbmRpdGlvbiwgb3IgcmVtb3ZlIHRoYXQgYnJhbmNoLic7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzYXZlQnJhbmNoKGlkeDogbnVtYmVyKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgaWYgKCFzIHx8ICFzLnN0ZXBzW2lkeF0pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgbGV0IGVyciA9IHRoaXMuYnJhbmNoUm93c0Vycm9yKCk7XG4gICAgICAgIGlmIChlcnIpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGFsZXJ0KGVycik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc3QgPSBzLnN0ZXBzW2lkeF07XG4gICAgICAgIGlmICh0aGlzLmJyYW5jaEVkaXRvclJvd3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHN0LmJyYW5jaGVzID0gdGhpcy5icmFuY2hFZGl0b3JSb3dzLnNsaWNlKCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN0LmJyYW5jaGVzID0gdW5kZWZpbmVkO1xuICAgICAgICBzdC5icmFuY2ggPSB1bmRlZmluZWQ7IC8vIGRyb3AgdGhlIGxlZ2FjeSBzaW5nbGUtYnJhbmNoIGFsaWFzXG4gICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdGhpcy5icmFuY2hFZGl0b3JJZHggPSAtMTtcbiAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSAIEltcG9ydCAvIGV4cG9ydCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuICAgIHByaXZhdGUgZXhwb3J0SnNvbigpOiB2b2lkXG4gICAge1xuICAgICAgICAvLyBHdWFyYW50ZWUgdGhlIGV4cG9ydGVkIHNoYXBlOiBvbmx5IGJyYW5jaGVzW10gKG5vIGxlZ2FjeSBicmFuY2gpXG4gICAgICAgIHRoaXMuc2NlbmFyaW9zLmZvckVhY2goc2MgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKHNjLnN0ZXBzKVxuICAgICAgICAgICAgICAgIHNjLnN0ZXBzLmZvckVhY2goc3QgPT4gdGhpcy5ub3JtYWxpemVTdGVwQnJhbmNoZXMoc3QpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxldCBwYXlsb2FkID0gSlNPTi5zdHJpbmdpZnkodGhpcy5zY2VuYXJpb3MsIG51bGwsIDIpO1xuICAgICAgICBsZXQgYmxvYiA9IG5ldyBCbG9iKFtwYXlsb2FkXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgIGxldCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgICBsZXQgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsO1xuICAgICAgICBhLmRvd25sb2FkID0gJ3JhZy1zY2VuYXJpb3MuanNvbic7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYSk7XG4gICAgICAgIGEuY2xpY2soKTtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChhKTtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICAgIH1cblxuICAgIHByaXZhdGUgaW1wb3J0SnNvbigpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgaW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuICAgICAgICBpbnB1dC50eXBlID0gJ2ZpbGUnO1xuICAgICAgICBpbnB1dC5hY2NlcHQgPSAnYXBwbGljYXRpb24vanNvbiwgLmpzb24nO1xuICAgICAgICBpbnB1dC5vbmNoYW5nZSA9IGFzeW5jICgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBmaWxlID0gaW5wdXQuZmlsZXMgJiYgaW5wdXQuZmlsZXNbMF07XG4gICAgICAgICAgICBpZiAoIWZpbGUpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgbGV0IGYgPSBmaWxlO1xuXG4gICAgICAgICAgICBsZXQgdGV4dCA9IGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZz4ocmVzb2x2ZSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgICAgICAgICAgICAgIHJlYWRlci5vbmxvYWQgPSAoKSA9PiByZXNvbHZlKHJlYWRlci5yZXN1bHQgYXMgc3RyaW5nKTtcbiAgICAgICAgICAgICAgICByZWFkZXIub25lcnJvciA9ICgpID0+IHJlc29sdmUoJycpO1xuICAgICAgICAgICAgICAgIHJlYWRlci5yZWFkQXNUZXh0KGYpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAodGV4dCA9PT0gJycpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB0cnlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgaW1wb3J0ZWQgPSBKU09OLnBhcnNlKHRleHQpIGFzIERhc2hTY2VuYXJpb1tdO1xuICAgICAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShpbXBvcnRlZCkpXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgYW4gYXJyYXkgb2Ygc2NlbmFyaW9zJyk7XG5cbiAgICAgICAgICAgICAgICBpbXBvcnRlZC5mb3JFYWNoKHNjID0+XG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjLmlkKVxuICAgICAgICAgICAgICAgICAgICAgICAgc2MuaWQgPSAnc2NuXycgKyBEYXRlLm5vdygpICsgJ18nICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDAwMCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2Muc3RlcHMpXG4gICAgICAgICAgICAgICAgICAgICAgICBzYy5zdGVwcyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBzYy5zdGVwcy5mb3JFYWNoKHN0ID0+IHRoaXMubm9ybWFsaXplU3RlcEJyYW5jaGVzKHN0KSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2MubG9vcENvdW50KVxuICAgICAgICAgICAgICAgICAgICAgICAgc2MubG9vcENvdW50ID0gMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzYy5jcmVhdGVkQXQpXG4gICAgICAgICAgICAgICAgICAgICAgICBzYy5jcmVhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjLnVwZGF0ZWRBdClcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNjZW5hcmlvcyA9IHRoaXMuc2NlbmFyaW9zLmNvbmNhdChpbXBvcnRlZCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudElkID09PSBudWxsICYmIHRoaXMuc2NlbmFyaW9zLmxlbmd0aCA+IDApXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudElkID0gdGhpcy5zY2VuYXJpb3NbdGhpcy5zY2VuYXJpb3MubGVuZ3RoIC0gMV0uaWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0ltcG9ydGVkICcgKyBpbXBvcnRlZC5sZW5ndGggKyAnIHNjZW5hcmlvKHMpLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGUpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgYWxlcnQoJ0ludmFsaWQgSlNPTjogZXhwZWN0ZWQgYW4gYXJyYXkgb2Ygc2NlbmFyaW9zLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBpbnB1dC5jbGljaygpO1xuICAgIH1cbn1cblxuKHdpbmRvdyBhcyBhbnkpLlNjZW5hcmlvRGFzaGJvYXJkID0gU2NlbmFyaW9EYXNoYm9hcmQ7XG4iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTGFuZ3VhZ2UgZW50cmllcyBhcmUgdGVtcGxhdGUgZGVsZWdhdGVzICovXHJcbnR5cGUgTGFuZ3VhZ2VFbnRyeSA9ICguLi5wYXJ0czogc3RyaW5nW10pID0+IHN0cmluZztcclxuXHJcbi8qKiBMYW5ndWFnZSBkZWZpbml0aW9ucyBmb3IgRW5nbGlzaDsgYWxzbyBhY3RzIGFzIHRoZSBiYXNlIGxhbmd1YWdlICovXHJcbmNsYXNzIEVuZ2xpc2hMYW5ndWFnZVxyXG57XHJcbiAgICBbaW5kZXg6IHN0cmluZ10gOiBMYW5ndWFnZUVudHJ5IHwgc3RyaW5nIHwgc3RyaW5nW107XHJcblxyXG4gICAgLy8gUkFHXHJcblxyXG4gICAgV0VMQ09NRSAgICAgICA9ICdXZWxjb21lIHRvIFJhaWwgQW5ub3VuY2VtZW50IEdlbmVyYXRvci4nO1xyXG4gICAgRE9NX01JU1NJTkcgICA9IChxOiBhbnkpID0+IGBSZXF1aXJlZCBET00gZWxlbWVudCBpcyBtaXNzaW5nOiAnJHtxfSdgO1xyXG4gICAgQVRUUl9NSVNTSU5HICA9IChhOiBhbnkpID0+IGBSZXF1aXJlZCBhdHRyaWJ1dGUgaXMgbWlzc2luZzogJyR7YX0nYDtcclxuICAgIERBVEFfTUlTU0lORyAgPSAoazogYW55KSA9PiBgUmVxdWlyZWQgZGF0YXNldCBrZXkgaXMgbWlzc2luZyBvciBlbXB0eTogJyR7a30nYDtcclxuICAgIEJBRF9ESVJFQ1RJT04gPSAodjogYW55KSA9PiBgRGlyZWN0aW9uIG5lZWRzIHRvIGJlIC0xIG9yIDEsIG5vdCAnJHt2fSdgO1xyXG4gICAgQkFEX0JPT0xFQU4gICA9ICh2OiBhbnkpID0+IGBHaXZlbiBzdHJpbmcgZG9lcyBub3QgcmVwcmVzZW50IGEgYm9vbGVhbjogJyR7dn0nYDtcclxuXHJcbiAgICAvLyBTdGF0ZVxyXG5cclxuICAgIFNUQVRFX0ZST01fU1RPUkFHRSAgPSAnU3RhdGUgaGFzIGJlZW4gbG9hZGVkIGZyb20gc3RvcmFnZS4nO1xyXG4gICAgU1RBVEVfVE9fU1RPUkFHRSAgICA9ICdTdGF0ZSBoYXMgYmVlbiBzYXZlZCB0byBzdG9yYWdlLCBhbmQgZHVtcGVkIHRvIGNvbnNvbGUuJztcclxuICAgIFNUQVRFX0NPUFlfUEFTVEUgICAgPSAnJWNDb3B5IGFuZCBwYXN0ZSB0aGlzIGluIGNvbnNvbGUgdG8gbG9hZCBsYXRlcjonO1xyXG4gICAgU1RBVEVfUkFXX0pTT04gICAgICA9ICclY1JhdyBKU09OIHN0YXRlOic7XHJcbiAgICBTVEFURV9TQVZFX01JU1NJTkcgID0gJ1NvcnJ5LCBubyBzdGF0ZSB3YXMgZm91bmQgaW4gc3RvcmFnZS4nO1xyXG4gICAgU1RBVEVfU0FWRV9GQUlMICAgICA9IChtc2c6IHN0cmluZykgPT5cclxuICAgICAgICBgU29ycnksIHN0YXRlIGNvdWxkIG5vdCBiZSBzYXZlZCB0byBzdG9yYWdlOiAke21zZ31gO1xyXG4gICAgU1RBVEVfQkFEX1BIUkFTRVNFVCA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYEF0dGVtcHRlZCB0byBnZXQgY2hvc2VuIGluZGV4IGZvciBwaHJhc2VzZXQgKCR7cn0pIHRoYXQgZG9lc24ndCBleGlzdC5gO1xyXG5cclxuICAgIC8vIENvbmZpZ1xyXG5cclxuICAgIENPTkZJR19MT0FEX0ZBSUwgID0gKG1zZzogYW55KSA9PiBgQ291bGQgbm90IGxvYWQgc2V0dGluZ3M6ICR7bXNnfWA7XHJcbiAgICBDT05GSUdfU0FWRV9GQUlMICA9IChtc2c6IGFueSkgPT4gYENvdWxkIG5vdCBzYXZlIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1JFU0VUX0ZBSUwgPSAobXNnOiBhbnkpID0+IGBDb3VsZCBub3QgY2xlYXIgc2V0dGluZ3M6ICR7bXNnfWA7XHJcblxyXG4gICAgLy8gRGF0YWJhc2VcclxuXHJcbiAgICBEQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FID0gKGU6IHN0cmluZykgPT5cclxuICAgICAgICBgQ29uZmlndXJlZCBwaHJhc2VzZXQgZWxlbWVudCBxdWVyeSAnJHtlfScgZG9lcyBub3QgcG9pbnQgdG8gYW4gaWZyYW1lIGVtYmVkLmA7XHJcblxyXG4gICAgREJfVU5LTk9XTl9TVEFUSU9OICAgPSAoYzogYW55KSA9PiBgVU5LTk9XTiBTVEFUSU9OOiAke2N9YDtcclxuICAgIERCX0VNUFRZX1NUQVRJT04gICAgID0gKGM6IGFueSkgPT5cclxuICAgICAgICBgU3RhdGlvbiBkYXRhYmFzZSBhcHBlYXJzIHRvIGNvbnRhaW4gYW4gZW1wdHkgbmFtZSBmb3IgY29kZSAnJHtjfScuYDtcclxuICAgIERCX1RPT19NQU5ZX1NUQVRJT05TID0gKCkgPT4gJ1BpY2tpbmcgdG9vIG1hbnkgc3RhdGlvbnMgdGhhbiB0aGVyZSBhcmUgYXZhaWxhYmxlJztcclxuXHJcbiAgICAvLyBUb29sYmFyXHJcblxyXG4gICAgVE9PTEJBUl9QTEFZICAgICA9ICdQbGF5IHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NUT1AgICAgID0gJ1N0b3AgcGxheWluZyBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TSFVGRkxFICA9ICdHZW5lcmF0ZSByYW5kb20gcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0FWRSAgICAgPSAnU2F2ZSBzdGF0ZSB0byBzdG9yYWdlJztcclxuICAgIFRPT0xCQVJfTE9BRCAgICAgPSAnUmVjYWxsIHN0YXRlIGZyb20gc3RvcmFnZSc7XHJcbiAgICBUT09MQkFSX1NFVFRJTkdTID0gJ09wZW4gc2V0dGluZ3MnO1xyXG5cclxuICAgIC8vIEVkaXRvclxyXG5cclxuICAgIFRJVExFX0NPQUNIICAgICAgID0gKGM6IGFueSkgPT4gYENsaWNrIHRvIGNoYW5nZSB0aGlzIGNvYWNoICgnJHtjfScpYDtcclxuICAgIFRJVExFX0VYQ1VTRSAgICAgID0gJ0NsaWNrIHRvIGNoYW5nZSB0aGlzIGV4Y3VzZSc7XHJcbiAgICBUSVRMRV9JTlRFR0VSICAgICA9IChjOiBhbnkpID0+IGBDbGljayB0byBjaGFuZ2UgdGhpcyBudW1iZXIgKCcke2N9JylgO1xyXG4gICAgVElUTEVfTkFNRUQgICAgICAgPSAnQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW5cXCdzIG5hbWUnO1xyXG4gICAgVElUTEVfT1BUX09QRU4gICAgPSAodDogYW55LCByOiBhbnkpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIG9wZW4gdGhpcyBvcHRpb25hbCAke3R9ICgnJHtyfScpYDtcclxuICAgIFRJVExFX09QVF9DTE9TRSAgID0gKHQ6IGFueSwgcjogYW55KSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjbG9zZSB0aGlzIG9wdGlvbmFsICR7dH0gKCcke3J9JylgO1xyXG4gICAgVElUTEVfUEhSQVNFU0VUICAgPSAocjogYW55KSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhlIHBocmFzZSB1c2VkIGluIHRoaXMgc2VjdGlvbiAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9QTEFURk9STSAgICA9ICdDbGljayB0byBjaGFuZ2UgdGhpcyB0cmFpblxcJ3MgcGxhdGZvcm0nO1xyXG4gICAgVElUTEVfU0VSVklDRSAgICAgPSAoYzogYW55KSA9PiBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc2VydmljZSAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OICAgICA9IChjOiBhbnkpID0+IGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uICgnJHtjfScpYDtcclxuICAgIFRJVExFX1NUQVRJT05MSVNUID0gKGM6IGFueSkgPT4gYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gbGlzdCAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9USU1FICAgICAgICA9IChjOiBhbnkpID0+IGBDbGljayB0byBjaGFuZ2UgdGhpcyB0aW1lICgnJHtjfScpYDtcclxuXHJcbiAgICBFRElUT1JfSU5JVCAgICAgICAgICAgICAgPSAnUGxlYXNlIHdhaXQuLi4nO1xyXG4gICAgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgID0gKG46IGFueSkgPT4gYChVTktOT1dOIFhNTCBFTEVNRU5UOiAke259KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgPSAocjogYW55KSA9PiBgKFVOS05PV04gUEhSQVNFOiAke3J9KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgPSAocjogYW55KSA9PiBgKFVOS05PV04gUEhSQVNFU0VUOiAke3J9KWA7XHJcblxyXG4gICAgLy8gUGhyYXNlclxyXG5cclxuICAgIFBIUkFTRVJfVE9PX1JFQ1VSU0lWRSA9ICdUb28gbWFueSBsZXZlbHMgb2YgcmVjdXJzaW9uIHdoaWxzdCBwcm9jZXNzaW5nIHBocmFzZS4nO1xyXG5cclxuICAgIC8vIFBpY2tlcnNcclxuXHJcbiAgICBIRUFERVJfQ09BQ0ggICAgICAgPSAoYzogYW55KSA9PiBgUGljayBhIGNvYWNoIGxldHRlciBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9FWENVU0UgICAgICA9ICdQaWNrIGFuIGV4Y3VzZSc7XHJcbiAgICBIRUFERVJfSU5URUdFUiAgICAgPSAoYzogYW55KSA9PiBgUGljayBhIG51bWJlciBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9OQU1FRCAgICAgICA9ICdQaWNrIGEgbmFtZWQgdHJhaW4nO1xyXG4gICAgSEVBREVSX1BIUkFTRVNFVCAgID0gKHI6IGFueSkgPT4gYFBpY2sgYSBwaHJhc2UgZm9yIHRoZSAnJHtyfScgc2VjdGlvbmA7XHJcbiAgICBIRUFERVJfUExBVEZPUk0gICAgPSAnUGljayBhIHBsYXRmb3JtJztcclxuICAgIEhFQURFUl9TRVJWSUNFICAgICA9IChjOiBhbnkpID0+IGBQaWNrIGEgc2VydmljZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OICAgICA9IChjOiBhbnkpID0+IGBQaWNrIGEgc3RhdGlvbiBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OTElTVCA9IChjOiBhbnkpID0+IGBCdWlsZCBhIHN0YXRpb24gbGlzdCBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9USU1FICAgICAgICA9IChjOiBhbnkpID0+IGBQaWNrIGEgdGltZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuXHJcbiAgICBQX0dFTkVSSUNfVCAgICAgID0gJ0xpc3Qgb2YgY2hvaWNlcyc7XHJcbiAgICBQX0dFTkVSSUNfUEggICAgID0gJ0ZpbHRlciBjaG9pY2VzLi4uJztcclxuICAgIFBfQ09BQ0hfVCAgICAgICAgPSAnQ29hY2ggbGV0dGVyJztcclxuICAgIFBfRVhDVVNFX1QgICAgICAgPSAnTGlzdCBvZiBkZWxheSBvciBjYW5jZWxsYXRpb24gZXhjdXNlcyc7XHJcbiAgICBQX0VYQ1VTRV9QSCAgICAgID0gJ0ZpbHRlciBleGN1c2VzLi4uJztcclxuICAgIFBfRVhDVVNFX0lURU1fVCAgPSAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgZXhjdXNlJztcclxuICAgIFBfSU5UX1QgICAgICAgICAgPSAnSW50ZWdlciB2YWx1ZSc7XHJcbiAgICBQX05BTUVEX1QgICAgICAgID0gJ0xpc3Qgb2YgdHJhaW4gbmFtZXMnO1xyXG4gICAgUF9OQU1FRF9QSCAgICAgICA9ICdGaWx0ZXIgdHJhaW4gbmFtZS4uLic7XHJcbiAgICBQX05BTUVEX0lURU1fVCAgID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIG5hbWUnO1xyXG4gICAgUF9QU0VUX1QgICAgICAgICA9ICdMaXN0IG9mIHBocmFzZXMnO1xyXG4gICAgUF9QU0VUX1BIICAgICAgICA9ICdGaWx0ZXIgcGhyYXNlcy4uLic7XHJcbiAgICBQX1BTRVRfSVRFTV9UICAgID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHBocmFzZSc7XHJcbiAgICBQX1BMQVRfTlVNQkVSX1QgID0gJ1BsYXRmb3JtIG51bWJlcic7XHJcbiAgICBQX1BMQVRfTEVUVEVSX1QgID0gJ09wdGlvbmFsIHBsYXRmb3JtIGxldHRlcic7XHJcbiAgICBQX1NFUlZfVCAgICAgICAgID0gJ0xpc3Qgb2Ygc2VydmljZSBuYW1lcyc7XHJcbiAgICBQX1NFUlZfUEggICAgICAgID0gJ0ZpbHRlciBzZXJ2aWNlcy4uLic7XHJcbiAgICBQX1NFUlZfSVRFTV9UICAgID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHNlcnZpY2UnO1xyXG4gICAgUF9TVEFUSU9OX1QgICAgICA9ICdMaXN0IG9mIHN0YXRpb24gbmFtZXMnO1xyXG4gICAgUF9TVEFUSU9OX1BIICAgICA9ICdGaWx0ZXIgc3RhdGlvbnMuLi4nO1xyXG4gICAgUF9TVEFUSU9OX0lURU1fVCA9ICdDbGljayB0byBzZWxlY3Qgb3IgYWRkIHRoaXMgc3RhdGlvbic7XHJcbiAgICBQX1NMX0FERCAgICAgICAgID0gJ0FkZCBzdGF0aW9uLi4uJztcclxuICAgIFBfU0xfQUREX1QgICAgICAgPSAnQWRkIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfQ0xPU0UgICAgICAgPSAnQ2xvc2UnO1xyXG4gICAgUF9TTF9DTE9TRV9UICAgICA9ICdDbG9zZSB0aGlzIHBpY2tlcic7XHJcbiAgICBQX1NMX0VNUFRZICAgICAgID0gJ1BsZWFzZSBhZGQgYXQgbGVhc3Qgb25lIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfRFJBR19UICAgICAgPSAnRHJhZ2dhYmxlIHNlbGVjdGlvbiBvZiBzdGF0aW9ucyBmb3IgdGhpcyBsaXN0JztcclxuICAgIFBfU0xfREVMRVRFICAgICAgPSAnRHJvcCBoZXJlIHRvIGRlbGV0ZSc7XHJcbiAgICBQX1NMX0RFTEVURV9UICAgID0gJ0Ryb3Agc3RhdGlvbiBoZXJlIHRvIGRlbGV0ZSBpdCBmcm9tIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0lURU1fVCAgICAgID0gJ0RyYWcgdG8gcmVvcmRlcjsgZG91YmxlLWNsaWNrIG9yIGRyYWcgaW50byBkZWxldGUgem9uZSB0byByZW1vdmUnO1xyXG4gICAgUF9USU1FX1QgICAgICAgICA9ICdUaW1lIGVkaXRvcic7XHJcblxyXG4gICAgLy8gU2V0dGluZ3NcclxuXHJcbiAgICBTVF9SRVNFVCAgICAgICAgICAgPSAnUmVzZXQgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfVCAgICAgICAgID0gJ1Jlc2V0IHNldHRpbmdzIHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk0gICA9ICdBcmUgeW91IHN1cmU/JztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk1fVCA9ICdDb25maXJtIHJlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0RPTkUgICAgICA9ICdTZXR0aW5ncyBoYXZlIGJlZW4gcmVzZXQgdG8gdGhlaXIgZGVmYXVsdHMsIGFuZCBkZWxldGVkIGZyb20nICtcclxuICAgICAgICAnIHN0b3JhZ2UuJztcclxuICAgIFNUX1NBVkUgICAgICAgICAgICA9ICdTYXZlICYgY2xvc2UnO1xyXG4gICAgU1RfU0FWRV9UICAgICAgICAgID0gJ1NhdmUgYW5kIGNsb3NlIHNldHRpbmdzJztcclxuICAgIFNUX1NQRUVDSCAgICAgICAgICA9ICdTcGVlY2gnO1xyXG4gICAgU1RfU1BFRUNIX0NIT0lDRSAgID0gJ1ZvaWNlJztcclxuICAgIFNUX1NQRUVDSF9FTVBUWSAgICA9ICdOb25lIGF2YWlsYWJsZSc7XHJcbiAgICBTVF9TUEVFQ0hfVk9MICAgICAgPSAnVm9sdW1lJztcclxuICAgIFNUX1NQRUVDSF9QSVRDSCAgICA9ICdQaXRjaCc7XHJcbiAgICBTVF9TUEVFQ0hfUkFURSAgICAgPSAnUmF0ZSc7XHJcbiAgICBTVF9TUEVFQ0hfVEVTVCAgICAgPSAnVGVzdCBzcGVlY2gnO1xyXG4gICAgU1RfU1BFRUNIX1RFU1RfVCAgID0gJ1BsYXkgYSBzcGVlY2ggc2FtcGxlIHdpdGggdGhlIGN1cnJlbnQgc2V0dGluZ3MnO1xyXG4gICAgU1RfTEVHQUwgICAgICAgICAgID0gJ0xlZ2FsICYgQWNrbm93bGVkZ2VtZW50cyc7XHJcblxyXG4gICAgV0FSTl9TSE9SVF9IRUFERVIgPSAnXCJNYXkgSSBoYXZlIHlvdXIgYXR0ZW50aW9uIHBsZWFzZS4uLlwiJztcclxuICAgIFdBUk5fU0hPUlQgICAgICAgID0gJ1RoaXMgZGlzcGxheSBpcyB0b28gc2hvcnQgdG8gc3VwcG9ydCBSQUcuIFBsZWFzZSBtYWtlIHRoaXMnICtcclxuICAgICAgICAnIHdpbmRvdyB0YWxsZXIsIG9yIHJvdGF0ZSB5b3VyIGRldmljZSBmcm9tIGxhbmRzY2FwZSB0byBwb3J0cmFpdC4nO1xyXG5cclxuICAgIC8vIFRPRE86IFRoZXNlIGRvbid0IGZpdCBoZXJlOyB0aGlzIHNob3VsZCBnbyBpbiB0aGUgZGF0YVxyXG4gICAgTEVUVEVSUyA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWic7XHJcbiAgICBESUdJVFMgID0gW1xyXG4gICAgICAgICd6ZXJvJywgICAgICdvbmUnLCAgICAgJ3R3bycsICAgICAndGhyZWUnLCAgICAgJ2ZvdXInLCAgICAgJ2ZpdmUnLCAgICAnc2l4JyxcclxuICAgICAgICAnc2V2ZW4nLCAgICAnZWlnaHQnLCAgICduaW5lJywgICAgJ3RlbicsICAgICAgICdlbGV2ZW4nLCAgICd0d2VsdmUnLCAgJ3RoaXJ0ZWVuJyxcclxuICAgICAgICAnZm91cnRlZW4nLCAnZmlmdGVlbicsICdzaXh0ZWVuJywgJ3NldmVudGVlbicsICdlaWdodGVlbicsICduaW50ZWVuJywgJ3R3ZW50eSdcclxuICAgIF07XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSG9sZHMgbWV0aG9kcyBmb3IgcHJvY2Vzc2luZyBlYWNoIHR5cGUgb2YgcGhyYXNlIGVsZW1lbnQgaW50byBIVE1MLCB3aXRoIGRhdGEgdGFrZW5cclxuICogZnJvbSB0aGUgY3VycmVudCBzdGF0ZS4gRWFjaCBtZXRob2QgdGFrZXMgYSBjb250ZXh0IG9iamVjdCwgaG9sZGluZyBkYXRhIGZvciB0aGVcclxuICogY3VycmVudCBYTUwgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgYW5kIHRoZSBYTUwgZG9jdW1lbnQgYmVpbmcgdXNlZC5cclxuICovXHJcbmNsYXNzIEVsZW1lbnRQcm9jZXNzb3JzXHJcbntcclxuICAgIC8qKiBGaWxscyBpbiBjb2FjaCBsZXR0ZXJzIGZyb20gQSB0byBaICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvYWNoKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0NPQUNIKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldENvYWNoKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGV4Y3VzZSwgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGV4Y3VzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0VYQ1VTRTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5leGN1c2U7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBpbnRlZ2Vycywgb3B0aW9uYWxseSB3aXRoIG5vdW5zIGFuZCBpbiB3b3JkIGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50ZWdlcihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnc2luZ3VsYXInKTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsdXJhbCcpO1xyXG4gICAgICAgIGxldCB3b3JkcyAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnd29yZHMnKTtcclxuXHJcbiAgICAgICAgbGV0IGludCAgICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGNvbnRleHQpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAod29yZHMgJiYgd29yZHMudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoaW50ID09PSAxICYmIHNpbmd1bGFyKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3Npbmd1bGFyfWA7XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHBsdXJhbClcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtwbHVyYWx9YDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0lOVEVHRVIoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHI7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG5cclxuICAgICAgICBpZiAoc2luZ3VsYXIpIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ10gPSBzaW5ndWxhcjtcclxuICAgICAgICBpZiAocGx1cmFsKSAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddICAgPSBwbHVyYWw7XHJcbiAgICAgICAgaWYgKHdvcmRzKSAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wyd3b3JkcyddICAgID0gd29yZHM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBuYW1lZChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX05BTUVEO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLm5hbWVkO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlLCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZShyZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9ICcnO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0UocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmFwcGVuZENoaWxkKCBFbGVtZW50UHJvY2Vzc29ycy53cmFwVG9Jbm5lcihwaHJhc2UpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcGhyYXNlIGZyb20gYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlc2V0LCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VzZXQoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG4gICAgICAgIGxldCBmb3JjZWRJZHggPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkeCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFU0VUKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBpZHggPSBmb3JjZWRJZHhcclxuICAgICAgICAgICAgPyBwYXJzZUludChmb3JjZWRJZHgpXHJcbiAgICAgICAgICAgIDogUkFHLnN0YXRlLmdldFBocmFzZXNldElkeChyZWYpO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlID0gcGhyYXNlc2V0LmNoaWxkcmVuW2lkeF0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2lkeCddID0gZm9yY2VkSWR4IHx8IGlkeC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGhyYXNlc2V0cyB3aXRoIGEgY2hhbmNlIHZhbHVlIGFzIGNvbGxhcHNpYmxlXHJcbiAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQoIEVsZW1lbnRQcm9jZXNzb3JzLndyYXBUb0lubmVyKHBocmFzZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGxhdGZvcm0oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9QTEFURk9STTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IChSQUcuc3RhdGUucGxhdGZvcm1bMV0gPT09ICdNJylcclxuICAgICAgICAgICAgPyBSQUcuc3RhdGUucGxhdGZvcm1bMF0gKyAnwr4nXHJcbiAgICAgICAgICAgIDogUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNlcnZpY2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU0VSVklDRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBuYW1lcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9uKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgY29kZSAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU1RBVElPTihjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBsaXN0cyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9ubGlzdChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzdGF0aW9ucyAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjb250ZXh0KS5zbGljZSgpO1xyXG4gICAgICAgIGxldCBzdGF0aW9uTGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KHN0YXRpb25zLCBjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT05MSVNUKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gc3RhdGlvbkxpc3Q7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgdGltZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0aW1lKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1RJTUUoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0VGltZShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHZveCBwYXJ0cyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB2b3goY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdrZXknKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTG9jYWxpemVcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCAgICA9IGN0eC54bWxFbGVtZW50LnRleHRDb250ZW50O1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgICAgID0gYENsaWNrIHRvIGVkaXQgdGhpcyBwaHJhc2UgKCR7a2V5fSlgO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgICAgID0gMTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydrZXknXSA9IGtleTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB1bmtub3duIGVsZW1lbnRzIHdpdGggYW4gaW5saW5lIGVycm9yIG1lc3NhZ2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdW5rbm93bihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWUgPSBjdHgueG1sRWxlbWVudC5ub2RlTmFtZTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX0VMRU1FTlQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRhY2hlcyBjaGFuY2UgYW5kIGEgcHJlLWRldGVybWluZWQgY29sbGFwc2Ugc3RhdGUgZm9yIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQsIGlmXHJcbiAgICAgKiBpdCBkb2VzIGhhdmUgYSBjaGFuY2UgYXR0cmlidWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGN0eCBDb250ZXh0IG9mIHRoZSBjdXJyZW50IHBocmFzZSBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZFxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IChvciBwaWNrKSB0aGUgY29sbGFwc2Ugc3RhdGUgb2ZcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWFrZUNvbGxhcHNpYmxlKGN0eDogUGhyYXNlQ29udGV4dCwgcmVmOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICggIWN0eC54bWxFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hhbmNlJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCBjaGFuY2UgICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2NoYW5jZScpITtcclxuICAgICAgICBsZXQgY29sbGFwc2VkID0gUkFHLnN0YXRlLmdldENvbGxhcHNlZCggcmVmLCBwYXJzZUludChjaGFuY2UpICk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddID0gY2hhbmNlO1xyXG5cclxuICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KGN0eC5uZXdFbGVtZW50LCBjb2xsYXBzZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xvbmVzIHRoZSBjaGlsZHJlbiBvZiB0aGUgZ2l2ZW4gZWxlbWVudCBpbnRvIGEgbmV3IGlubmVyIHNwYW4gdGFnLCBzbyB0aGF0IHRoZXlcclxuICAgICAqIGNhbiBiZSBtYWRlIGNvbGxhcHNpYmxlIG9yIGJ1bmRsZWQgd2l0aCBidXR0b25zLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzb3VyY2UgUGFyZW50IHRvIGNsb25lIHRoZSBjaGlsZHJlbiBvZiwgaW50byBhIHdyYXBwZXJcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgd3JhcFRvSW5uZXIoc291cmNlOiBIVE1MRWxlbWVudCkgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgaW5uZXIuY2xhc3NMaXN0LmFkZCgnaW5uZXInKTtcclxuICAgICAgICBET00uY2xvbmVJbnRvKHNvdXJjZSwgaW5uZXIpO1xyXG5cclxuICAgICAgICByZXR1cm4gaW5uZXI7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogUmVwcmVzZW50cyBjb250ZXh0IGRhdGEgZm9yIGEgcGhyYXNlLCB0byBiZSBwYXNzZWQgdG8gYW4gZWxlbWVudCBwcm9jZXNzb3IgKi9cclxuaW50ZXJmYWNlIFBocmFzZUNvbnRleHRcclxue1xyXG4gICAgLyoqIEdldHMgdGhlIFhNTCBwaHJhc2UgZWxlbWVudCB0aGF0IGlzIGJlaW5nIHJlcGxhY2VkICovXHJcbiAgICB4bWxFbGVtZW50IDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogR2V0cyB0aGUgSFRNTCBzcGFuIGVsZW1lbnQgdGhhdCBpcyByZXBsYWNpbmcgdGhlIFhNTCBlbGVtZW50ICovXHJcbiAgICBuZXdFbGVtZW50IDogSFRNTFNwYW5FbGVtZW50O1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIEhhbmRsZXMgdGhlIHRyYW5zZm9ybWF0aW9uIG9mIHBocmFzZSBYTUwgZGF0YSwgaW50byBIVE1MIGVsZW1lbnRzIHdpdGggdGhlaXIgZGF0YVxyXG4gKiBmaWxsZWQgaW4gYW5kIHRoZWlyIFVJIGxvZ2ljIHdpcmVkLlxyXG4gKi9cclxuY2xhc3MgUGhyYXNlclxyXG57XHJcbiAgICAvKipcclxuICAgICAqIFJlY3Vyc2l2ZWx5IHByb2Nlc3NlcyBYTUwgZWxlbWVudHMsIGZpbGxpbmcgaW4gZGF0YSBhbmQgYXBwbHlpbmcgdHJhbnNmb3Jtcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyIFBhcmVudCB0byBwcm9jZXNzIHRoZSBjaGlsZHJlbiBvZlxyXG4gICAgICogQHBhcmFtIGxldmVsIEN1cnJlbnQgbGV2ZWwgb2YgcmVjdXJzaW9uLCBtYXguIDIwXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwcm9jZXNzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxldmVsOiBudW1iZXIgPSAwKVxyXG4gICAge1xyXG4gICAgICAgIC8vIEluaXRpYWxseSwgdGhpcyBtZXRob2Qgd2FzIHN1cHBvc2VkIHRvIGp1c3QgYWRkIHRoZSBYTUwgZWxlbWVudHMgZGlyZWN0bHkgaW50b1xyXG4gICAgICAgIC8vIHRoZSBkb2N1bWVudC4gSG93ZXZlciwgdGhpcyBjYXVzZWQgYSBsb3Qgb2YgcHJvYmxlbXMgKGUuZy4gdGl0bGUgbm90IHdvcmtpbmcpLlxyXG4gICAgICAgIC8vIEhUTUwgZG9lcyBub3Qgd29yayByZWFsbHkgd2VsbCB3aXRoIGN1c3RvbSBlbGVtZW50cywgZXNwZWNpYWxseSBpZiB0aGV5IGFyZSBvZlxyXG4gICAgICAgIC8vIGFub3RoZXIgWE1MIG5hbWVzcGFjZS5cclxuXHJcbiAgICAgICAgbGV0IHF1ZXJ5ICAgPSAnOm5vdChzcGFuKTpub3Qoc3ZnKTpub3QodXNlKTpub3QoYnV0dG9uKSc7XHJcbiAgICAgICAgbGV0IHBlbmRpbmcgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbChxdWVyeSkgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XHJcblxyXG4gICAgICAgIC8vIE5vIG1vcmUgWE1MIGVsZW1lbnRzIHRvIGV4cGFuZFxyXG4gICAgICAgIGlmIChwZW5kaW5nLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBYTUwgZWxlbWVudCBjdXJyZW50bHkgaW4gdGhlIGNvbnRhaW5lcjpcclxuICAgICAgICAvLyAqIENyZWF0ZSBhIG5ldyBzcGFuIGVsZW1lbnQgZm9yIGl0XHJcbiAgICAgICAgLy8gKiBIYXZlIHRoZSBwcm9jZXNzb3JzIHRha2UgZGF0YSBmcm9tIHRoZSBYTUwgZWxlbWVudCwgdG8gcG9wdWxhdGUgdGhlIG5ldyBvbmVcclxuICAgICAgICAvLyAqIFJlcGxhY2UgdGhlIFhNTCBlbGVtZW50IHdpdGggdGhlIG5ldyBvbmVcclxuICAgICAgICBwZW5kaW5nLmZvckVhY2goZWxlbWVudCA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnROYW1lID0gZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBsZXQgbmV3RWxlbWVudCAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgICAgIGxldCBjb250ZXh0ICAgICA9IHtcclxuICAgICAgICAgICAgICAgIHhtbEVsZW1lbnQ6IGVsZW1lbnQsXHJcbiAgICAgICAgICAgICAgICBuZXdFbGVtZW50OiBuZXdFbGVtZW50XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBuZXdFbGVtZW50LmRhdGFzZXRbJ3R5cGUnXSA9IGVsZW1lbnROYW1lO1xyXG5cclxuICAgICAgICAgICAgLy8gSSB3YW50ZWQgdG8gdXNlIGFuIGluZGV4IG9uIEVsZW1lbnRQcm9jZXNzb3JzIGZvciB0aGlzLCBidXQgaXQgY2F1c2VkIGV2ZXJ5XHJcbiAgICAgICAgICAgIC8vIHByb2Nlc3NvciB0byBoYXZlIGFuIFwidW51c2VkIG1ldGhvZFwiIHdhcm5pbmcuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoZWxlbWVudE5hbWUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMuY29hY2goY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnZXhjdXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5leGN1c2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLmludGVnZXIoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ25hbWVkJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMubmFtZWQoY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGhyYXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5waHJhc2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2VzZXQnOiAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZXNldChjb250ZXh0KTsgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BsYXRmb3JtJzogICAgRWxlbWVudFByb2Nlc3NvcnMucGxhdGZvcm0oY29udGV4dCk7ICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICBFbGVtZW50UHJvY2Vzc29ycy5zZXJ2aWNlKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnN0YXRpb24oY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbmxpc3QoY29udGV4dCk7IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAndGltZSc6ICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy50aW1lKGNvbnRleHQpOyAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd2b3gnOiAgICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnZveChjb250ZXh0KTsgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICAgICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudW5rbm93bihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUmVjdXJzZSBzbyB0aGF0IHdlIGNhbiBleHBhbmQgYW55IG5ldyBlbGVtZW50c1xyXG4gICAgICAgIGlmIChsZXZlbCA8IDIwKVxyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGFpbmVyLCBsZXZlbCArIDEpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoTC5QSFJBU0VSX1RPT19SRUNVUlNJVkUpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xuXG4vKiogT25lIGJyYW5jaDogYSBjb25kaXRpb24gdGhhdCwgaWYgbWV0LCBqdW1wcyB0aGUgcnVuIHRvIGEgdGFyZ2V0ICovXG5pbnRlcmZhY2UgU2NlbmFyaW9CcmFuY2hcbntcbiAgICBjb25kaXRpb246ICdkZWxheScgfCAncmFuZG9tJyB8ICd0aW1lJyB8ICdwbGF0Zm9ybScgfCAnc2VydmljZSc7XG4gICAgLyoqIE1lYW5pbmcgZGVwZW5kcyBvbiBjb25kaXRpb246IGRlbGF5IG1pbnV0ZXMsIHJhbmRvbSBwZXJjZW50LCBob3VyLCBwbGF0Zm9ybSB0ZXh0LCBzZXJ2aWNlIHRleHQgKi9cbiAgICB0aHJlc2hvbGQ/OiBudW1iZXIgfCBzdHJpbmc7XG4gICAgLyoqIExlZ2FjeTogc2FtZSBhcyB0aHJlc2hvbGQgZm9yIHRoZSByYW5kb20gY29uZGl0aW9uICovXG4gICAgcHJvYmFiaWxpdHk/OiBudW1iZXI7XG4gICAgdGFyZ2V0OiBudW1iZXIgfCAnZW5kJyB8IHN0cmluZztcbiAgICAvKiogT3B0aW9uYWwgaHVtYW4gbGFiZWwgZm9yIHRoZSBicmFuY2ggKFwiaWYgZGVsYXkgPj0gNVwiKTsgdW51c2VkIGJ5IHRoZSBydW5uZXIgKi9cbiAgICBsYWJlbD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNjZW5hcmlvU3RlcFxue1xuICAgIHR5cGU6ICdhbm5vdW5jZW1lbnQnIHwgJ3dhaXQnO1xuICAgIHN0YXRlSnNvbj86IHN0cmluZztcbiAgICBnYXBNczogbnVtYmVyO1xuICAgIHdhaXRTZWNvbmRzPzogbnVtYmVyO1xuICAgIGxhYmVsPzogc3RyaW5nO1xuICAgIC8qKiBPcmRlcmVkIGJyYW5jaGVzIChpZiAvIGVsaWYpOiB0aGUgZmlyc3QgbWF0Y2ggd2lucywgbm9uZSBtYXRjaGluZyBmYWxscyB0aHJvdWdoIChlbHNlKSAqL1xuICAgIGJyYW5jaGVzPzogU2NlbmFyaW9CcmFuY2hbXTtcbiAgICAvKiogTGVnYWN5IHNpbmdsZSBicmFuY2g7IG1pZ3JhdGVkIHRvIGJyYW5jaGVzW10gb24gbG9hZCwgc3RpbGwgaG9ub3VyZWQgYXQgcnVuIHRpbWUgKi9cbiAgICBicmFuY2g/OiBTY2VuYXJpb0JyYW5jaDtcbn1cblxuY2xhc3MgU2NlbmFyaW9cbntcbiAgICBwcml2YXRlIHN0ZXBzOiBTY2VuYXJpb1N0ZXBbXSA9IFtdO1xuICAgIHByaXZhdGUgY3VycmVudEluZGV4OiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgcnVubmluZzogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgcGF1c2VkOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSB0aW1lcjogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIHdhaXRJbnRlcnZhbDogbnVtYmVyID0gMDtcbiAgICAvKiogV2hlbiB0cnVlLCB0aGUgc2NlbmFyaW8gc3RvcHMgcmlnaHQgYWZ0ZXIgdGhlIGN1cnJlbnQgc3RlcCAoc2luZ2xlLXN0ZXAgcGxheSkgKi9cbiAgICBwcml2YXRlIHN0b3BBZnRlclN0ZXA6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAvKiogU2FmZXR5IHRpbWVyOiBhZHZhbmNlcyB0aGUgc3RlcCBldmVuIGlmIHRoZSBzcGVlY2ggZW5naW5lIG5ldmVyIHNpZ25hbHMgY29tcGxldGlvbiAqL1xuICAgIHByaXZhdGUgd2F0Y2hkb2c6IG51bWJlciA9IDA7XG4gICAgLyoqIEd1YXJkIHNvIGEgc3RlcCBjb21wbGV0ZXMgKHNwZWVjaCBlbmQgb3Igd2F0Y2hkb2cpIGFuZCBhZHZhbmNlcyBleGFjdGx5IG9uY2UgKi9cbiAgICBwcml2YXRlIHN0ZXBGaW5pc2hlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgbG9vcENvdW50OiBudW1iZXIgPSAxO1xuICAgIHByaXZhdGUgbG9vcHNEb25lOiBudW1iZXIgPSAwO1xuXG4gICAgcHVibGljIG9uU3RlcD86IChpZHg6IG51bWJlciwgdG90YWw6IG51bWJlciwgc3RlcDogU2NlbmFyaW9TdGVwKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBvbldhaXRDb3VudGRvd24/OiAocmVtYWluaW5nOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWQ7XG4gICAgcHVibGljIG9uQ29tcGxldGU/OiAoKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBvbkVycm9yPzogKG1zZzogc3RyaW5nKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBvblRleHRVcGRhdGU/OiAodGV4dDogc3RyaW5nKSA9PiB2b2lkO1xuXG4gICAgcHVibGljIHNldFN0ZXBzKHN0ZXBzOiBTY2VuYXJpb1N0ZXBbXSk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc3RlcHMgPSBzdGVwcztcbiAgICAgICAgdGhpcy5jdXJyZW50SW5kZXggPSAwO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRTdGVwKHN0YXRlSnNvbjogc3RyaW5nLCBnYXBNczogbnVtYmVyID0gMTUwMCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc3RlcHMucHVzaCh7IHR5cGU6ICdhbm5vdW5jZW1lbnQnLCBzdGF0ZUpzb24sIGdhcE1zIH0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRMb29wQ291bnQobjogbnVtYmVyKTogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5sb29wQ291bnQgPSBNYXRoLm1heCgxLCBuKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0IHN0ZXBDb3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5zdGVwcy5sZW5ndGg7IH1cbiAgICBwdWJsaWMgZ2V0IGlzUnVubmluZygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMucnVubmluZzsgfVxuICAgIHB1YmxpYyBnZXQgaXNQYXVzZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnBhdXNlZDsgfVxuICAgIHB1YmxpYyBleHBvcnRKc29uKCk6IHZvaWQgeyAvKiBuby1vcDsgZGFzaGJvYXJkIGhhbmRsZXMgZXhwb3J0ICovIH1cbiAgICBwdWJsaWMgZ2V0IGN1cnJlbnRMb29wVmFsdWUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubG9vcHNEb25lICsgMTsgfVxuICAgIHB1YmxpYyBnZXQgdG90YWxMb29wc1ZhbHVlKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmxvb3BDb3VudDsgfVxuXG4gICAgcHVibGljIGNsZWFyKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICB0aGlzLnN0ZXBzID0gW107XG4gICAgICAgIHRoaXMuY3VycmVudEluZGV4ID0gMDtcbiAgICB9XG5cbiAgICBwdWJsaWMgcGxheSgpOiB2b2lkXG4gICAge1xuICAgICAgICBpZiAodGhpcy5zdGVwcy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICAgICAgaWYgKHRoaXMucGF1c2VkKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnBhdXNlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMucnVuU3RlcCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICB0aGlzLnJ1bm5pbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLnBhdXNlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmN1cnJlbnRJbmRleCA9IDA7XG4gICAgICAgIHRoaXMubG9vcHNEb25lID0gMDtcbiAgICAgICAgdGhpcy5zdG9wQWZ0ZXJTdGVwID0gZmFsc2U7XG4gICAgICAgIHRoaXMucnVuU3RlcCgpO1xuICAgIH1cblxuICAgIC8qKiBQbGF5cyBleGFjdGx5IG9uZSBzdGVwIChpdHMgYW5ub3VuY2VtZW50LCBvciBpdHMgd2FpdCksIHRoZW4gc3RvcHMgKi9cbiAgICBwdWJsaWMgcGxheVN0ZXAoaWR4OiBudW1iZXIpOiB2b2lkXG4gICAge1xuICAgICAgICBpZiAoaWR4IDwgMCB8fCBpZHggPj0gdGhpcy5zdGVwcy5sZW5ndGgpIHJldHVybjtcblxuICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5jdXJyZW50SW5kZXggPSBpZHg7XG4gICAgICAgIHRoaXMubG9vcHNEb25lID0gMDtcbiAgICAgICAgdGhpcy5sb29wQ291bnQgPSAxO1xuICAgICAgICB0aGlzLnN0b3BBZnRlclN0ZXAgPSB0cnVlO1xuICAgICAgICB0aGlzLnJ1blN0ZXAoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgcGF1c2UoKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICAgICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMucGF1c2VkICA9IHRydWU7XG5cbiAgICAgICAgLy8gU3RvcCBzcGVlY2ggZmlyc3Q6IGl0IG1heSByZS1maXJlIG9uc3RvcCwgd2hpY2ggY291bGQgc2NoZWR1bGUgYVxuICAgICAgICAvLyBwZW5kaW5nIGFkdmFuY2U7IGNsZWFyIGFsbCB0aW1lcnMgYWZ0ZXJ3YXJkcyBzbyBub3RoaW5nIHN1cnZpdmVzLlxuICAgICAgICBpZiAodHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnNwZWVjaCkgUkFHLnNwZWVjaC5zdG9wKCk7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKTtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMud2F0Y2hkb2cpO1xuICAgICAgICBjbGVhckludGVydmFsKHRoaXMud2FpdEludGVydmFsKTtcbiAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1NUT1BfUExBWUJBQ0snKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3RvcCgpOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5wYXVzZWQgID0gZmFsc2U7XG5cbiAgICAgICAgLy8gU3RvcCBzcGVlY2ggZmlyc3QgKHNlZSBwYXVzZSkgc28gYSByZS1maXJlZCBvbnN0b3AgY2FuJ3QgbGVhdmUgYVxuICAgICAgICAvLyBwZW5kaW5nIGFkdmFuY2UgdGltZXIgYmVoaW5kIHRoaXMgY2xlYXIuXG4gICAgICAgIGlmICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcuc3BlZWNoKSBSQUcuc3BlZWNoLnN0b3AoKTtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZXIpO1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy53YXRjaGRvZyk7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy53YWl0SW50ZXJ2YWwpO1xuICAgICAgICB0aGlzLnN0ZXBGaW5pc2hlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnN0b3BBZnRlclN0ZXAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1NUT1BfUExBWUJBQ0snKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJ1blN0ZXAoKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy5jdXJyZW50SW5kZXggPj0gdGhpcy5zdGVwcy5sZW5ndGgpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMubG9vcHNEb25lKys7XG4gICAgICAgICAgICBpZiAodGhpcy5sb29wc0RvbmUgPCB0aGlzLmxvb3BDb3VudClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5ydW5TdGVwKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnBhdXNlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1NUT1BfUExBWUJBQ0snKTtcbiAgICAgICAgICAgIGlmICh0aGlzLm9uQ29tcGxldGUpIHRoaXMub25Db21wbGV0ZSgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHN0ZXAgPSB0aGlzLnN0ZXBzW3RoaXMuY3VycmVudEluZGV4XTtcbiAgICAgICAgaWYgKHRoaXMub25TdGVwKSB0aGlzLm9uU3RlcCh0aGlzLmN1cnJlbnRJbmRleCwgdGhpcy5zdGVwcy5sZW5ndGgsIHN0ZXApO1xuXG4gICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICd3YWl0JylcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IHRvdGFsID0gc3RlcC53YWl0U2Vjb25kcyB8fCAwO1xuICAgICAgICAgICAgbGV0IHJlbWFpbmluZyA9IHRvdGFsO1xuICAgICAgICAgICAgbGV0IHdhaXRUZXh0ID0gYFdhaXRpbmcgJHtyZW1haW5pbmd9cy4uLmA7XG4gICAgICAgICAgICBpZiAodGhpcy5vblRleHRVcGRhdGUpIHRoaXMub25UZXh0VXBkYXRlKHdhaXRUZXh0KTtcbiAgICAgICAgICAgIGlmICh0aGlzLm9uV2FpdENvdW50ZG93bikgdGhpcy5vbldhaXRDb3VudGRvd24ocmVtYWluaW5nLCB0b3RhbCk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnZpZXdzICYmIFJBRy52aWV3cy5tYXJxdWVlKSBSQUcudmlld3MubWFycXVlZS5zZXQod2FpdFRleHQpO1xuICAgICAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1dBSVRfQ09VTlRET1dOJywgeyByZW1haW5pbmdTZWNvbmRzOiByZW1haW5pbmcsIHRvdGFsU2Vjb25kczogdG90YWwgfSk7XG5cbiAgICAgICAgICAgIHRoaXMud2FpdEludGVydmFsID0gd2luZG93LnNldEludGVydmFsKCgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVtYWluaW5nLS07XG4gICAgICAgICAgICAgICAgaWYgKHJlbWFpbmluZyA8PSAwKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLndhaXRJbnRlcnZhbCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGV0IHR4dCA9IGBXYWl0aW5nICR7cmVtYWluaW5nfXMuLi5gO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLm9uVGV4dFVwZGF0ZSkgdGhpcy5vblRleHRVcGRhdGUodHh0KTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vbldhaXRDb3VudGRvd24pIHRoaXMub25XYWl0Q291bnRkb3duKHJlbWFpbmluZywgdG90YWwpO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcudmlld3MgJiYgUkFHLnZpZXdzLm1hcnF1ZWUpIFJBRy52aWV3cy5tYXJxdWVlLnNldCh0eHQpO1xuICAgICAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0KCdXQUlUX0NPVU5URE9XTicsIHsgcmVtYWluaW5nU2Vjb25kczogcmVtYWluaW5nLCB0b3RhbFNlY29uZHM6IHRvdGFsIH0pO1xuICAgICAgICAgICAgfSwgMTAwMCk7XG5cbiAgICAgICAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy53YWl0SW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIHRoaXMuYWR2YW5jZShzdGVwKTtcbiAgICAgICAgICAgIH0sIHRvdGFsICogMTAwMCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBbm5vdW5jZW1lbnQgc3RlcFxuICAgICAgICB0cnlcbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKHN0ZXAuc3RhdGVKc29uICYmIHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy5sb2FkKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFJBRy5sb2FkKHN0ZXAuc3RhdGVKc29uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSlcbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKHRoaXMub25FcnJvcikgdGhpcy5vbkVycm9yKCdGYWlsZWQgdG8gbG9hZCBzdGVwIHN0YXRlOiAnICsgZSk7XG4gICAgICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB0ZXh0ID0gKHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy52aWV3cyAmJiBSQUcudmlld3MuZWRpdG9yKSA/IFJBRy52aWV3cy5lZGl0b3IuZ2V0VGV4dCgpIDogJ1BsYXlpbmcgc3RlcC4uLic7XG4gICAgICAgIGlmICh0aGlzLm9uVGV4dFVwZGF0ZSkgdGhpcy5vblRleHRVcGRhdGUodGV4dCk7XG4gICAgICAgIGlmICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcudmlld3MgJiYgUkFHLnZpZXdzLm1hcnF1ZWUpIFJBRy52aWV3cy5tYXJxdWVlLnNldCh0ZXh0KTtcbiAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1BMQVlfU0NFTkFSSU9fU1RFUCcsIHsgaW5kZXg6IHRoaXMuY3VycmVudEluZGV4LCB0ZXh0OiB0ZXh0IH0pO1xuXG4gICAgICAgIGxldCBwaHJhc2VFbCA9ICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcudmlld3MgJiYgUkFHLnZpZXdzLmVkaXRvcikgPyBSQUcudmlld3MuZWRpdG9yLmdldFBocmFzZSgpIDogbnVsbDtcbiAgICAgICAgaWYgKHBocmFzZUVsICYmIHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy5zcGVlY2gpXG4gICAgICAgIHtcbiAgICAgICAgICAgIC8vIFJlc2V0IHRoZSBwZXItc3RlcCBndWFyZCwgdGhlbiBhcm0gYm90aCB0aGUgbm9ybWFsIHBhdGggKHNwZWVjaFxuICAgICAgICAgICAgLy8gc2lnbmFscyBjb21wbGV0aW9uKSBhbmQgYSB3YXRjaGRvZyBpbiBjYXNlIHRoZSBlbmdpbmUgbmV2ZXIgZG9lcy5cbiAgICAgICAgICAgIHRoaXMuc3RlcEZpbmlzaGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIFJBRy5zcGVlY2gub25zcGVhayA9ICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IGN1cnJlbnRUZXh0ID0gUkFHLnZpZXdzLmVkaXRvci5nZXRUZXh0KCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub25UZXh0VXBkYXRlKSB0aGlzLm9uVGV4dFVwZGF0ZShjdXJyZW50VGV4dCk7XG4gICAgICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KGN1cnJlbnRUZXh0KTtcbiAgICAgICAgICAgICAgICBSQUcuc3BlZWNoLm9uc3BlYWsgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCA9ICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5maW5pc2hTdGVwKHN0ZXAsIHN0ZXAuZ2FwTXMpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gV2F0Y2hkb2c6IGdlbmVyb3VzIGVub3VnaCBub3QgdG8gY3V0IHJlYWwgc3BlZWNoIHNob3J0XG4gICAgICAgICAgICAvLyAofjkwbXMvY2hhciwgY2xhbXBlZCB0byA2cy4uNjBzKSwgYnV0IGJvdW5kZWQgc28gYSBodW5nIGVuZ2luZVxuICAgICAgICAgICAgLy8gY2FuIG5ldmVyIHN0YWxsIHRoZSBzY2VuYXJpby5cbiAgICAgICAgICAgIGxldCB3YXRjaGRvZ01zID0gTWF0aC5taW4oNjAwMDAsIE1hdGgubWF4KDYwMDAsIHRleHQubGVuZ3RoICogOTApKTtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLndhdGNoZG9nKTtcbiAgICAgICAgICAgIHRoaXMud2F0Y2hkb2cgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMuZmluaXNoU3RlcChzdGVwLCBzdGVwLmdhcE1zKTtcbiAgICAgICAgICAgIH0sIHdhdGNoZG9nTXMpO1xuXG4gICAgICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKHBocmFzZUVsKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuc3RlcEZpbmlzaGVkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkdmFuY2Uoc3RlcCk7XG4gICAgICAgICAgICB9LCBzdGVwLmdhcE1zIHx8IDE1MDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tcGxldGVzIHRoZSBjdXJyZW50IHN0ZXAgZXhhY3RseSBvbmNlLCB3aGV0aGVyIGl0IGVuZGVkIGJlY2F1c2UgdGhlXG4gICAgICogc3BlZWNoIGVuZ2luZSBzaWduYWxsZWQgY29tcGxldGlvbiBvciBiZWNhdXNlIHRoZSB3YXRjaGRvZyBmaXJlZC4gU2FmZVxuICAgICAqIGFnYWluc3QgdGhlIHJlLWVudHJhbnQgb25zdG9wIHRoYXQgc3BlZWNoLnN0b3AoKSBjYW4gdHJpZ2dlcjogdGhlXG4gICAgICogc3RlcEZpbmlzaGVkIGd1YXJkIGlzIHNldCBiZWZvcmUgc3BlZWNoIGlzIHN0b3BwZWQuXG4gICAgICovXG4gICAgcHJpdmF0ZSBmaW5pc2hTdGVwKHN0ZXA6IFNjZW5hcmlvU3RlcCwgZ2FwTXM6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICh0aGlzLnN0ZXBGaW5pc2hlZClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy5zdGVwRmluaXNoZWQgPSB0cnVlO1xuXG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLndhdGNoZG9nKTtcbiAgICAgICAgaWYgKHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy5zcGVlY2gpXG4gICAgICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcblxuICAgICAgICB0aGlzLnRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5hZHZhbmNlKHN0ZXApO1xuICAgICAgICB9LCBnYXBNcyB8fCAwKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFkdmFuY2Uoc3RlcDogU2NlbmFyaW9TdGVwKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcblxuICAgICAgICAvLyBcIlBsYXkgb25lIHN0ZXBcIiBtb2RlOiB0aGlzIHN0ZXAgd2FzIHRoZSBvbmx5IG9uZSBhc2tlZCBmb3IsIHNvXG4gICAgICAgIC8vIGZpbmlzaCB0aGUgcnVuIGhlcmUgKGJyYW5jaGVzIGRlbGliZXJhdGVseSBkbyBub3QgZmlyZSkuXG4gICAgICAgIGlmICh0aGlzLnN0b3BBZnRlclN0ZXApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcEFmdGVyU3RlcCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnBhdXNlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1NUT1BfUExBWUJBQ0snKTtcbiAgICAgICAgICAgIGlmICh0aGlzLm9uQ29tcGxldGUpIHRoaXMub25Db21wbGV0ZSgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3JkZXJlZCBicmFuY2hlcyAoaWYgLyBlbGlmIC8gZWxzZSk6IHRoZSBmaXJzdCBicmFuY2ggd2hvc2VcbiAgICAgICAgLy8gY29uZGl0aW9uIG1hdGNoZXMgd2lucyBhbmQganVtcHMgdG8gaXRzIHRhcmdldDsgd2hlbiBub25lIG1hdGNoIHRoZVxuICAgICAgICAvLyBydW4gZmFsbHMgdGhyb3VnaCB0byB0aGUgbmV4dCBzdGVwLlxuICAgICAgICBsZXQgYnJhbmNoZXM6IFNjZW5hcmlvQnJhbmNoW10gPSBbXTtcbiAgICAgICAgaWYgKHN0ZXAuYnJhbmNoZXMgJiYgc3RlcC5icmFuY2hlcy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgYnJhbmNoZXMgPSBzdGVwLmJyYW5jaGVzO1xuICAgICAgICBlbHNlIGlmIChzdGVwLmJyYW5jaClcbiAgICAgICAgICAgIGJyYW5jaGVzID0gW3N0ZXAuYnJhbmNoXTtcblxuICAgICAgICBmb3IgKGxldCBrID0gMDsgayA8IGJyYW5jaGVzLmxlbmd0aDsgaysrKVxuICAgICAgICB7XG4gICAgICAgICAgICBpZiAodGhpcy5ldmFsQnJhbmNoKGJyYW5jaGVzW2tdKSAmJiB0aGlzLmp1bXBUbyhicmFuY2hlc1trXS50YXJnZXQpKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY3VycmVudEluZGV4Kys7XG4gICAgICAgIHRoaXMucnVuU3RlcCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEp1bXBzIHRoZSBydW4gdG8gYSBicmFuY2ggdGFyZ2V0ICgnZW5kJywgYW4gaW5kZXgsIG9yIGEgbGFiZWwpLlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUganVtcCBsYW5kZWQ7IGFuIHVudXNhYmxlIHRhcmdldCAod3JvbmcgdHlwZSkgbWFrZXNcbiAgICAgKiB0aGUgY2FsbGVyIGZhbGwgdGhyb3VnaCB0byB0aGUgbmV4dCBzdGVwIGluc3RlYWQgKG5vIHN0YWxsKS4gQSBsYWJlbFxuICAgICAqIHRoYXQgbWF0Y2hlcyBubyBzdGVwIGdvZXMgdG8gdGhlIGVuZCBvZiB0aGUgc2NlbmFyaW8uXG4gICAgICovXG4gICAgcHJpdmF0ZSBqdW1wVG8odGFyZ2V0OiBudW1iZXIgfCAnZW5kJyB8IHN0cmluZyk6IGJvb2xlYW5cbiAgICB7XG4gICAgICAgIGlmICh0YXJnZXQgPT09ICdlbmQnKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRJbmRleCA9IHRoaXMuc3RlcHMubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5ydW5TdGVwKCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgdGFyZ2V0ID09PSAnc3RyaW5nJylcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IGlkeCA9IHRoaXMuc3RlcHMuZmluZEluZGV4KHMgPT4gcy5sYWJlbCA9PT0gdGFyZ2V0KTtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEluZGV4ID0gaWR4ID49IDAgPyBpZHggOiB0aGlzLnN0ZXBzLmxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMucnVuU3RlcCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIHRhcmdldCA9PT0gJ251bWJlcicpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGFyZ2V0LCB0aGlzLnN0ZXBzLmxlbmd0aCkpO1xuICAgICAgICAgICAgdGhpcy5ydW5TdGVwKCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV2YWxCcmFuY2goYjogU2NlbmFyaW9CcmFuY2gpOiBib29sZWFuXG4gICAge1xuICAgICAgICBpZiAoIWIpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKHR5cGVvZiBSQUcgPT09ICd1bmRlZmluZWQnIHx8ICFSQUcuc3RhdGUpIHJldHVybiBmYWxzZTtcblxuICAgICAgICBzd2l0Y2ggKGIuY29uZGl0aW9uKVxuICAgICAgICB7XG4gICAgICAgICAgICBjYXNlICdkZWxheSc6XG4gICAgICAgICAgICAgICAgdHJ5XG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBsZXQgZCA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKCdkZWxheWVkJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkID49IFNjZW5hcmlvLm51bVRocmVzaG9sZChiLnRocmVzaG9sZCwgMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICAgICAgICBjYXNlICdyYW5kb20nOlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIC8vIExlZ2FjeSBwcm9iYWJpbGl0eSB3aW5zOyB0aHJlc2hvbGQgaXMgaXRzIG1vZGVybiByZXBsYWNlbWVudFxuICAgICAgICAgICAgICAgIGxldCBwY3QgPSA1MDtcbiAgICAgICAgICAgICAgICBpZiAoYi5wcm9iYWJpbGl0eSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgICAgICBwY3QgPSBiLnByb2JhYmlsaXR5O1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGIudGhyZXNob2xkICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgICAgIHBjdCA9IFNjZW5hcmlvLm51bVRocmVzaG9sZChiLnRocmVzaG9sZCwgNTApO1xuICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLnJhbmRvbSgpICogMTAwIDwgcGN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndGltZSc6XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IGhvdXIgPSBTY2VuYXJpby5udW1UaHJlc2hvbGQoYi50aHJlc2hvbGQsIC0xKTtcbiAgICAgICAgICAgICAgICBpZiAoaG91ciA8IDApXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB0cnlcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0ID0gUkFHLnN0YXRlLmdldFRpbWUoJ21haW4nKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGggPSBwYXJzZUludCh0LnNwbGl0KCc6JylbMF0sIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGggPj0gaG91cjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ3BsYXRmb3JtJzpcbiAgICAgICAgICAgICAgICB0cnlcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBwbGF0U3RyID0gUkFHLnN0YXRlLnBsYXRmb3JtWzBdICsgUkFHLnN0YXRlLnBsYXRmb3JtWzFdO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGxhdFN0ci50cmltKCkgPT09IFN0cmluZyhiLnRocmVzaG9sZCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6XG4gICAgICAgICAgICAgICAgdHJ5XG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gUkFHLnN0YXRlLmdldFNlcnZpY2UoJ3Byb3ZpZGVyJykudG9Mb3dlckNhc2UoKS5pbmRleE9mKFN0cmluZyhiLnRocmVzaG9sZCB8fCAnJykudG9Mb3dlckNhc2UoKSkgIT09IC0xO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogQnJvYWRjYXN0IGEgcGxheWJhY2sgZXZlbnQgdG8gdGhlIG90aGVyIHRhYnMgKHRoZSBlZGl0b3IgbWlycm9ycyBpdCwgZGlzcGxheS1vbmx5KSAqL1xuICAgIHByaXZhdGUgYnJvYWRjYXN0KHR5cGU6IHN0cmluZywgcGF5bG9hZD86IGFueSk6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcuY2hhbm5lbClcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLnNlbmQodHlwZSwgcGF5bG9hZCB8fCB7fSk7XG4gICAgfVxuXG4gICAgLyoqIENvZXJjZXMgYSB0aHJlc2hvbGQgKG51bWJlciBvciBudW1lcmljIHN0cmluZykgdG8gYSBudW1iZXIsIGVsc2UgdGhlIGZhbGxiYWNrICovXG4gICAgcHJpdmF0ZSBzdGF0aWMgbnVtVGhyZXNob2xkKHZhbHVlOiBudW1iZXIgfCBzdHJpbmcgfCB1bmRlZmluZWQsIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXJcbiAgICB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKVxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgbiA9IHBhcnNlRmxvYXQodmFsdWUpO1xuICAgICAgICAgICAgaWYgKCFpc05hTihuKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxsYmFjaztcbiAgICB9XG59XG5cbih3aW5kb3cgYXMgYW55KS5TY2VuYXJpbyA9IFNjZW5hcmlvO1xuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIHJlc29sdmluZyBhIGdpdmVuIHBocmFzZSB0byB2b3gga2V5cyAqL1xyXG5jbGFzcyBSZXNvbHZlclxyXG57XHJcbiAgICAvKiogVHJlZVdhbGtlciBmaWx0ZXIgdG8gcmVkdWNlIGEgd2FsayB0byBqdXN0IHRoZSBlbGVtZW50cyB0aGUgcmVzb2x2ZXIgbmVlZHMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSk6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcGFyZW50VHlwZSA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghcGFyZW50VHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCAgICAgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWNjZXB0IHRleHQgb25seSBmcm9tIHBocmFzZSBhbmQgcGhyYXNlc2V0c1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICBpZiAocGFyZW50VHlwZSAhPT0gJ3BocmFzZXNldCcgJiYgcGFyZW50VHlwZSAhPT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgICAgICAvLyBSZWplY3QgY29sbGFwc2VkIGVsZW1lbnRzIGFuZCB0aGVpciBjaGlsZHJlblxyXG4gICAgICAgICAgICBpZiAoIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCB0eXBlbGVzcyAod3JhcHBlcikgZWxlbWVudHNcclxuICAgICAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIG92ZXIgcGhyYXNlIGFuZCBwaHJhc2VzZXRzIChpbnN0ZWFkLCBvbmx5IGdvaW5nIGZvciB0aGVpciBjaGlsZHJlbilcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnIHx8IHR5cGUgPT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGhyYXNlICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHJpdmF0ZSBmbGF0dGVuZWQgOiBOb2RlW107XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlZCAgOiBWb3hLZXlbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGhyYXNlOiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnBocmFzZSAgICA9IHBocmFzZTtcclxuICAgICAgICB0aGlzLmZsYXR0ZW5lZCA9IFtdO1xyXG4gICAgICAgIHRoaXMucmVzb2x2ZWQgID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHRvVm94KCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIC8vIEZpcnN0LCB3YWxrIHRocm91Z2ggdGhlIHBocmFzZSBhbmQgXCJmbGF0dGVuXCIgaXQgaW50byBhbiBhcnJheSBvZiBwYXJ0cy4gVGhpcyBpc1xyXG4gICAgICAgIC8vIHNvIHRoZSByZXNvbHZlciBjYW4gbG9vay1haGVhZCBvciBsb29rLWJlaGluZC5cclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgICAgIGxldCB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgdGhpcy5waHJhc2UsXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19URVhUIHwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogUmVzb2x2ZXIubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggdHJlZVdhbGtlci5uZXh0Tm9kZSgpIClcclxuICAgICAgICBpZiAodHJlZVdhbGtlci5jdXJyZW50Tm9kZS50ZXh0Q29udGVudCEudHJpbSgpICE9PSAnJylcclxuICAgICAgICAgICAgdGhpcy5mbGF0dGVuZWQucHVzaCh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVzb2x2ZSBhbGwgdGhlIHBocmFzZXMnIG5vZGVzIGludG8gdm94IGtleXNcclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQuZm9yRWFjaCggKHYsIGkpID0+IHRoaXMucmVzb2x2ZWQucHVzaCggLi4udGhpcy5yZXNvbHZlKHYsIGkpICkgKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5mbGF0dGVuZWQsIHRoaXMucmVzb2x2ZWQpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXNlcyB0aGUgdHlwZSBhbmQgdmFsdWUgb2YgdGhlIGdpdmVuIG5vZGUsIHRvIHJlc29sdmUgaXQgdG8gdm94IGZpbGUgSURzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBub2RlIE5vZGUgdG8gcmVzb2x2ZSB0byB2b3ggSURzXHJcbiAgICAgKiBAcGFyYW0gaWR4IEluZGV4IG9mIHRoZSBub2RlIGJlaW5nIHJlc29sdmVkIHJlbGF0aXZlIHRvIHRoZSBwaHJhc2UgYXJyYXlcclxuICAgICAqIEByZXR1cm5zIEFycmF5IG9mIElEcyB0aGF0IG1ha2UgdXAgb25lIG9yIG1vcmUgZmlsZSBJRHMuIENhbiBiZSBlbXB0eS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlKG5vZGU6IE5vZGUsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGV4dChub2RlKTtcclxuXHJcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUNvYWNoKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2V4Y3VzZSc6ICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUV4Y3VzZShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVJbnRlZ2VyKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICduYW1lZCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVOYW1lZCgpO1xyXG4gICAgICAgICAgICBjYXNlICdwbGF0Zm9ybSc6ICAgIHJldHVybiB0aGlzLnJlc29sdmVQbGF0Zm9ybShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTZXJ2aWNlKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3RpbWUnOiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRpbWUoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVZveChlbGVtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEluZmxlY3Rpb24oaWR4OiBudW1iZXIpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgPSB0aGlzLmZsYXR0ZW5lZFtpZHggKyAxXTtcclxuXHJcbiAgICAgICAgcmV0dXJuICggbmV4dCAmJiBuZXh0LnRleHRDb250ZW50IS50cmltKCkuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgPyAnZW5kJ1xyXG4gICAgICAgICAgICA6ICdtaWQnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRleHQobm9kZTogTm9kZSkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBub2RlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBTdHJpbmdzLmNsZWFuKG5vZGUudGV4dENvbnRlbnQhKTtcclxuICAgICAgICBsZXQgc2V0ICAgID0gW107XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgaXMganVzdCBhIGZ1bGwgc3RvcCwgcmV0dXJuIHNpbGVuY2VcclxuICAgICAgICBpZiAodGV4dCA9PT0gJy4nKVxyXG4gICAgICAgICAgICByZXR1cm4gWzAuNjVdO1xyXG5cclxuICAgICAgICAvLyBJZiBpdCBiZWdpbnMgd2l0aCBhIGZ1bGwgc3RvcCwgYWRkIHNpbGVuY2VcclxuICAgICAgICBpZiAoIHRleHQuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0ZXh0IGRvZXNuJ3QgY29udGFpbiBhbnkgd29yZHMsIHNraXBcclxuICAgICAgICBpZiAoICF0ZXh0Lm1hdGNoKC9bYS16MC05XS9pKSApXHJcbiAgICAgICAgICAgIHJldHVybiBzZXQ7XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCByZWYgPSBwYXJlbnQuZGF0YXNldFsncmVmJ107XHJcbiAgICAgICAgbGV0IGlkeCA9IERPTS5ub2RlSW5kZXhPZihub2RlKTtcclxuICAgICAgICBsZXQgaWQgID0gYCR7dHlwZX0uJHtyZWZ9YDtcclxuXHJcbiAgICAgICAgLy8gQXBwZW5kIGluZGV4IG9mIHBocmFzZXNldCdzIGNob2ljZSBvZiBwaHJhc2VcclxuICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZXNldCcpXHJcbiAgICAgICAgICAgIGlkICs9IGAuJHtwYXJlbnQuZGF0YXNldFsnaWR4J119YDtcclxuXHJcbiAgICAgICAgaWQgKz0gYC4ke2lkeH1gO1xyXG4gICAgICAgIHNldC5wdXNoKGlkKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGV4dCBlbmRzIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LmVuZHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICBzZXQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHNldDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVDb2FjaChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgY29hY2ggICA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgPSBbMC4yLCBgbGV0dGVyLiR7Y29hY2h9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUV4Y3VzZShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBleGN1c2UgID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgICAgICBsZXQga2V5ICAgICA9IFN0cmluZ3MuZmlsZW5hbWUoZXhjdXNlKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMTUsIGBleGN1c2UuJHtrZXl9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUludGVnZXIoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHNpbmd1bGFyID0gZWxlbWVudC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIGxldCBwbHVyYWwgICA9IGVsZW1lbnQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgbGV0IGludGVnZXIgID0gUkFHLnN0YXRlLmdldEludGVnZXIoY3R4KTtcclxuICAgICAgICBsZXQgcGFydHMgICAgPSBbMC4xMjUsIGBudW1iZXIuJHtpbnRlZ2VyfS5taWRgXTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoc2luZ3VsYXIgJiYgaW50ZWdlciA9PT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjE1LCBgbnVtYmVyLnN1ZmZpeC4ke3Npbmd1bGFyfS5lbmRgKTtcclxuICAgICAgICBlbHNlIGlmIChwbHVyYWwgICAmJiBpbnRlZ2VyICE9PSAxKVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMTUsIGBudW1iZXIuc3VmZml4LiR7cGx1cmFsfS5lbmRgKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVOYW1lZCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZWQgPSBTdHJpbmdzLmZpbGVuYW1lKFJBRy5zdGF0ZS5uYW1lZCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbMC4yLCBgbmFtZWQuJHtuYW1lZH0ubWlkYCwgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVQbGF0Zm9ybShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuICAgICAgICBsZXQgaW5mbGVjdCAgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgbGV0dGVyICAgPSAocGxhdGZvcm1bMV0gPT09ICfCvicpID8gJ00nIDogcGxhdGZvcm1bMV07XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgID0gWzAuMTUsIGBudW1iZXIuJHtwbGF0Zm9ybVswXX0ke2xldHRlcn0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU2VydmljZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzZXJ2aWNlID0gU3RyaW5ncy5maWxlbmFtZSggUkFHLnN0YXRlLmdldFNlcnZpY2UoY3R4KSApO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gW107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgYWRkIGJlZ2lubmluZyBkZWxheSBpZiB0aGVyZSBpc24ndCBhbHJlYWR5IG9uZSBwcmlvclxyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5yZXNvbHZlZC5zbGljZSgtMSlbMF0gIT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjE1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5yZXN1bHQsIGBzZXJ2aWNlLiR7c2VydmljZX0ubWlkYCwgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU3RhdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGN0eCk7XHJcbiAgICAgICAgbGV0IHZveEtleSAgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvblZveChzdGF0aW9uKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMiwgYHN0YXRpb24uJHt2b3hLZXl9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBsaXN0ICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgbGlzdC5mb3JFYWNoKCAoY29kZSwgaykgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCB2b3hLZXkgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvblZveChjb2RlKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBtaWRkbGUgb2YgbGlzdCBpbmZsZWN0aW9uXHJcbiAgICAgICAgICAgIGlmIChrICE9PSBsaXN0Lmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9Lm1pZGAsIDAuMjUpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBBZGQgXCJhbmRcIiBpZiBsaXN0IGhhcyBtb3JlIHRoYW4gMSBzdGF0aW9uIGFuZCB0aGlzIGlzIHRoZSBlbmRcclxuICAgICAgICAgICAgaWYgKGxpc3QubGVuZ3RoID4gMSlcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goJ3N0YXRpb24ucGFydHMuYW5kLm1pZCcsIDAuMjUpO1xyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwib25seVwiIGlmIG9ubHkgb25lIHN0YXRpb24gaW4gdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgICAgICBpZiAobGlzdC5sZW5ndGggPT09IDEgJiYgY3R4ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9Lm1pZGApO1xyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsICdzdGF0aW9uLnBhcnRzLm9ubHkuZW5kJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgc3RhdGlvbi4ke3ZveEtleX0uJHtpbmZsZWN0fWApO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAwLjJdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRpbWUoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHRpbWUgID0gUkFHLnN0YXRlLmdldFRpbWUoY3R4KS5zcGxpdCgnOicpO1xyXG5cclxuICAgICAgICBsZXQgcGFydHMgOiBWb3hLZXlbXSA9IFswLjJdO1xyXG5cclxuICAgICAgICBpZiAodGltZVswXSA9PT0gJzAwJyAmJiB0aW1lWzFdID09PSAnMDAnKVxyXG4gICAgICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAnbnVtYmVyLjAwMDAubWlkJywgMC4yXTtcclxuXHJcbiAgICAgICAgLy8gSG91cnNcclxuICAgICAgICBwYXJ0cy5wdXNoKGBudW1iZXIuJHt0aW1lWzBdfS5iZWdpbmApO1xyXG5cclxuICAgICAgICBpZiAodGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjA3NSwgJ251bWJlci5odW5kcmVkLm1pZCcpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsIGBudW1iZXIuJHt0aW1lWzFdfS5taWRgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlVm94KGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRleHQgICA9IGVsZW1lbnQuaW5uZXJUZXh0LnRyaW0oKTtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gW107XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5zdGFydHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmVzdWx0LnB1c2goIGVsZW1lbnQuZGF0YXNldFsna2V5J10hICk7XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBzcGVlY2ggc3ludGhlc2lzIHVzaW5nIGJvdGggbmF0aXZlIGFuZCBjdXN0b20gZW5naW5lcyAqL1xyXG5jbGFzcyBTcGVlY2hcclxue1xyXG4gICAgLyoqIEluc3RhbmNlIG9mIHRoZSBjdXN0b20gdm9pY2UgZW5naW5lICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHZveEVuZ2luZT8gOiBWb3hFbmdpbmU7XHJcblxyXG4gICAgLyoqIERpY3Rpb25hcnkgb2YgYnJvd3Nlci1wcm92aWRlZCB2b2ljZXMgYXZhaWxhYmxlICovXHJcbiAgICBwdWJsaWMgIGJyb3dzZXJWb2ljZXMgOiBEaWN0aW9uYXJ5PFNwZWVjaFN5bnRoZXNpc1ZvaWNlPiA9IHt9O1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGlzIGF1ZGlibHkgc3Bva2VuICovXHJcbiAgICBwdWJsaWMgIG9uc3BlYWs/ICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBlbmRlZCAqL1xyXG4gICAgcHVibGljICBvbnN0b3A/ICAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG5hdGl2ZSBzcGVlY2gtc3RvcHBlZCBjaGVjayB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSBzdG9wVGltZXIgICAgIDogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvKiogV2hldGhlciBhbnkgc3BlZWNoIGVuZ2luZSBpcyBjdXJyZW50bHkgc3BlYWtpbmcgKi9cclxuICAgIHB1YmxpYyBnZXQgaXNTcGVha2luZygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLnZveEVuZ2luZSAmJiB0aGlzLnZveEVuZ2luZS5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFraW5nO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBWT1ggZW5naW5lIGlzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBnZXQgdm94QXZhaWxhYmxlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudm94RW5naW5lICE9PSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBTb21lIGJyb3dzZXJzIGRvbid0IHByb3Blcmx5IGNhbmNlbCBzcGVlY2ggb24gcGFnZSBjbG9zZS5cclxuICAgICAgICAvLyBCVUc6IG9ucGFnZXNob3cgYW5kIG9ucGFnZWhpZGUgbm90IHdvcmtpbmcgb24gaU9TIDExXHJcbiAgICAgICAgd2luZG93Lm9uYmVmb3JldW5sb2FkID1cclxuICAgICAgICB3aW5kb3cub251bmxvYWQgICAgICAgPVxyXG4gICAgICAgIHdpbmRvdy5vbnBhZ2VzaG93ICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZWhpZGUgICAgID0gdGhpcy5zdG9wLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50Lm9udmlzaWJpbGl0eWNoYW5nZSAgICAgICAgICAgID0gdGhpcy5vblZpc2liaWxpdHlDaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLm9udm9pY2VzY2hhbmdlZCA9IHRoaXMub25Wb2ljZXNDaGFuZ2VkLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEV2ZW4gdGhvdWdoICdvbnZvaWNlc2NoYW5nZWQnIGlzIHVzZWQgbGF0ZXIgdG8gcG9wdWxhdGUgdGhlIGxpc3QsIENocm9tZSBkb2VzXHJcbiAgICAgICAgLy8gbm90IGFjdHVhbGx5IGZpcmUgdGhlIGV2ZW50IHVudGlsIHRoaXMgY2FsbC4uLlxyXG4gICAgICAgIHRoaXMub25Wb2ljZXNDaGFuZ2VkKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzb21lIHJlYXNvbiwgQ2hyb21lIG5lZWRzIHRoaXMgY2FsbGVkIG9uY2UgZm9yIG5hdGl2ZSBzcGVlY2ggdG8gd29ya1xyXG4gICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuY2FuY2VsKCk7XHJcblxyXG4gICAgICAgIHRyeSAgICAgICAgIHsgdGhpcy52b3hFbmdpbmUgPSBuZXcgVm94RW5naW5lKCk7IH1cclxuICAgICAgICBjYXRjaCAoZXJyKSB7IGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBjcmVhdGUgVk9YIGVuZ2luZTonLCBlcnIpOyB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBzcGVha2luZyB0aGUgZ2l2ZW4gcGhyYXNlIGNvbXBvbmVudHMgKi9cclxuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIC8vIFZPWCBlbmdpbmVcclxuICAgICAgICBpZiAgICAgICggdGhpcy52b3hFbmdpbmUgJiYgZWl0aGVyKHNldHRpbmdzLnVzZVZveCwgUkFHLmNvbmZpZy52b3hFbmFibGVkKSApXHJcbiAgICAgICAgICAgIHRoaXMuc3BlYWtWb3gocGhyYXNlLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIC8vIE5hdGl2ZSBicm93c2VyIHRleHQtdG8tc3BlZWNoXHJcbiAgICAgICAgZWxzZSBpZiAod2luZG93LnNwZWVjaFN5bnRoZXNpcylcclxuICAgICAgICAgICAgdGhpcy5zcGVha0Jyb3dzZXIocGhyYXNlLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIC8vIE5vIHNwZWVjaCBhdmFpbGFibGU7IGNhbGwgc3RvcCBldmVudCBoYW5kbGVyXHJcbiAgICAgICAgZWxzZSBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgIHRoaXMub25zdG9wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIGFuZCBjYW5jZWxzIGFsbCBxdWV1ZWQgc3BlZWNoICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzKVxyXG4gICAgICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmNhbmNlbCgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy52b3hFbmdpbmUpXHJcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lLnN0b3AoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQYXVzZSBhbmQgdW5wYXVzZSBzcGVlY2ggaWYgdGhlIHBhZ2UgaXMgaGlkZGVuIG9yIHVuaGlkZGVuICovXHJcbiAgICBwcml2YXRlIG9uVmlzaWJpbGl0eUNoYW5nZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IFRoaXMgbmVlZHMgdG8gcGF1c2UgVk9YIGVuZ2luZVxyXG4gICAgICAgIGxldCBoaWRpbmcgPSAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIGlmIChoaWRpbmcpIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucGF1c2UoKTtcclxuICAgICAgICBlbHNlICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnJlc3VtZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGFzeW5jIHZvaWNlIGxpc3QgbG9hZGluZyBvbiBzb21lIGJyb3dzZXJzLCBhbmQgc2V0cyBkZWZhdWx0ICovXHJcbiAgICBwcml2YXRlIG9uVm9pY2VzQ2hhbmdlZCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuYnJvd3NlclZvaWNlcyA9IHt9O1xyXG5cclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmdldFZvaWNlcygpLmZvckVhY2godiA9PiB0aGlzLmJyb3dzZXJWb2ljZXNbdi5uYW1lXSA9IHYpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIGdpdmVuIHBocmFzZSB0byB0ZXh0IGFuZCBzcGVha3MgaXQgdmlhIG5hdGl2ZSBicm93c2VyIHZvaWNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3BlYWtCcm93c2VyKHBocmFzZTogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZvaWNlTmFtZSA9IGVpdGhlcihzZXR0aW5ncy52b2ljZU5hbWUsIFJBRy5jb25maWcuc3BlZWNoVm9pY2UpO1xyXG4gICAgICAgIGxldCB2b2ljZSAgICAgPSB0aGlzLmJyb3dzZXJWb2ljZXNbdm9pY2VOYW1lXTtcclxuXHJcbiAgICAgICAgLy8gUmVzZXQgdG8gZmlyc3Qgdm9pY2UsIGlmIGNvbmZpZ3VyZWQgY2hvaWNlIGlzIG1pc3NpbmdcclxuICAgICAgICBpZiAoIXZvaWNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGZpcnN0ID0gT2JqZWN0LmtleXModGhpcy5icm93c2VyVm9pY2VzKVswXTtcclxuICAgICAgICAgICAgdm9pY2UgICAgID0gdGhpcy5icm93c2VyVm9pY2VzW2ZpcnN0XTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFRoZSBwaHJhc2UgdGV4dCBpcyBzcGxpdCBpbnRvIHNlbnRlbmNlcywgYXMgcXVldWVpbmcgbGFyZ2Ugc2VudGVuY2VzIHRoYXQgbGFzdFxyXG4gICAgICAgIC8vIG1hbnkgc2Vjb25kcyBjYW4gYnJlYWsgc29tZSBUVFMgZW5naW5lcyBhbmQgYnJvd3NlcnMuXHJcbiAgICAgICAgbGV0IHRleHQgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoL1xcLlxccy9pKTtcclxuXHJcbiAgICAgICAgcGFydHMuZm9yRWFjaCggKHNlZ21lbnQsIGlkeCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEFkZCBtaXNzaW5nIGZ1bGwgc3RvcCB0byBlYWNoIHNlbnRlbmNlIGV4Y2VwdCB0aGUgbGFzdCwgd2hpY2ggaGFzIGl0XHJcbiAgICAgICAgICAgIGlmIChpZHggPCBwYXJ0cy5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICAgICAgc2VnbWVudCArPSAnLic7XHJcblxyXG4gICAgICAgICAgICBsZXQgdXR0ZXJhbmNlID0gbmV3IFNwZWVjaFN5bnRoZXNpc1V0dGVyYW5jZShzZWdtZW50KTtcclxuXHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2ljZSAgPSB2b2ljZTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIFJBRy5jb25maWcuc3BlZWNoVm9sKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnBpdGNoICA9IGVpdGhlcihzZXR0aW5ncy5waXRjaCwgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2gpO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2UucmF0ZSAgID0gZWl0aGVyKHNldHRpbmdzLnJhdGUsICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlKTtcclxuXHJcbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuc3BlYWsodXR0ZXJhbmNlKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBpbW1lZGlhdGVseS4gSSBkb24ndCB0cnVzdCBzcGVlY2ggZXZlbnRzIHRvIGJlIHJlbGlhYmxlOyBzZWUgYmVsb3cuXHJcbiAgICAgICAgaWYgKHRoaXMub25zcGVhaylcclxuICAgICAgICAgICAgdGhpcy5vbnNwZWFrKCk7XHJcblxyXG4gICAgICAgIC8vIFRoaXMgY2hlY2tzIGZvciB3aGVuIHRoZSBuYXRpdmUgZW5naW5lIGhhcyBzdG9wcGVkIHNwZWFraW5nLCBhbmQgY2FsbHMgdGhlXHJcbiAgICAgICAgLy8gb25zdG9wIGV2ZW50IGhhbmRsZXIuIEkgY291bGQgdXNlIFNwZWVjaFN5bnRoZXNpcy5vbmVuZCBpbnN0ZWFkLCBidXQgaXQgd2FzXHJcbiAgICAgICAgLy8gZm91bmQgdG8gYmUgdW5yZWxpYWJsZSwgc28gSSBoYXZlIHRvIHBvbGwgdGhlIHNwZWFraW5nIHByb3BlcnR5IHRoaXMgd2F5LlxyXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5zdG9wVGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLnN0b3BUaW1lciA9IHNldEludGVydmFsKCgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAod2luZG93LnNwZWVjaFN5bnRoZXNpcy5zcGVha2luZylcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5zdG9wVGltZXIpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgICAgICB9LCAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3ludGhlc2l6ZXMgdm9pY2UgYnkgd2Fsa2luZyB0aHJvdWdoIHRoZSBnaXZlbiBwaHJhc2UgZWxlbWVudHMsIHJlc29sdmluZyBwYXJ0cyB0b1xyXG4gICAgICogc291bmQgZmlsZSBJRHMsIGFuZCBmZWVkaW5nIHRoZSBlbnRpcmUgYXJyYXkgdG8gdGhlIHZveCBlbmdpbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBocmFzZSBQaHJhc2UgZWxlbWVudHMgdG8gc3BlYWtcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwZWFrVm94KHBocmFzZTogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc29sdmVyID0gbmV3IFJlc29sdmVyKHBocmFzZSk7XHJcbiAgICAgICAgbGV0IHZveFBhdGggID0gUkFHLmNvbmZpZy52b3hQYXRoIHx8IFJBRy5jb25maWcudm94Q3VzdG9tUGF0aDtcclxuXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3BlYWsgPSAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMub25zcGVhaylcclxuICAgICAgICAgICAgICAgIHRoaXMub25zcGVhaygpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgPSAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3BlYWsgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgID0gdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBcHBseSBzZXR0aW5ncyBmcm9tIGNvbmZpZyBoZXJlLCB0byBrZWVwIFZPWCBlbmdpbmUgZGVjb3VwbGVkIGZyb20gUkFHXHJcbiAgICAgICAgc2V0dGluZ3Mudm94UGF0aCAgID0gZWl0aGVyKHNldHRpbmdzLnZveFBhdGgsICAgdm94UGF0aCk7XHJcbiAgICAgICAgc2V0dGluZ3Mudm94UmV2ZXJiID0gZWl0aGVyKHNldHRpbmdzLnZveFJldmVyYiwgUkFHLmNvbmZpZy52b3hSZXZlcmIpO1xyXG4gICAgICAgIHNldHRpbmdzLnZveENoaW1lICA9IGVpdGhlcihzZXR0aW5ncy52b3hDaGltZSwgIFJBRy5jb25maWcudm94Q2hpbWUpO1xyXG4gICAgICAgIHNldHRpbmdzLnZvbHVtZSAgICA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsICAgIFJBRy5jb25maWcuc3BlZWNoVm9sKTtcclxuICAgICAgICBzZXR0aW5ncy5yYXRlICAgICAgPSBlaXRoZXIoc2V0dGluZ3MucmF0ZSwgICAgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUpO1xyXG5cclxuICAgICAgICB0aGlzLnZveEVuZ2luZSEuc3BlYWsocmVzb2x2ZXIudG9Wb3goKSwgc2V0dGluZ3MpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFR5cGUgZGVmaW5pdGlvbiBmb3Igc3BlZWNoIGNvbmZpZyBvdmVycmlkZXMgcGFzc2VkIHRvIHRoZSBzcGVhayBtZXRob2QgKi9cclxuaW50ZXJmYWNlIFNwZWVjaFNldHRpbmdzXHJcbntcclxuICAgIC8qKiBXaGV0aGVyIHRvIGZvcmNlIHVzZSBvZiB0aGUgVk9YIGVuZ2luZSAqL1xyXG4gICAgdXNlVm94PyAgICA6IGJvb2xlYW47XHJcbiAgICAvKiogT3ZlcnJpZGUgYWJzb2x1dGUgb3IgcmVsYXRpdmUgVVJMIG9mIFZPWCB2b2ljZSB0byB1c2UgKi9cclxuICAgIHZveFBhdGg/ICAgOiBzdHJpbmc7XHJcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIHJldmVyYiB0byB1c2UgKi9cclxuICAgIHZveFJldmVyYj8gOiBzdHJpbmc7XHJcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIGNoaW1lIHRvIHVzZSAqL1xyXG4gICAgdm94Q2hpbWU/ICA6IHN0cmluZztcclxuICAgIC8qKiBPdmVycmlkZSBjaG9pY2Ugb2YgbmF0aXZlIHZvaWNlICovXHJcbiAgICB2b2ljZU5hbWU/IDogc3RyaW5nO1xyXG4gICAgLyoqIE92ZXJyaWRlIHZvbHVtZSBvZiB2b2ljZSAqL1xyXG4gICAgdm9sdW1lPyAgICA6IG51bWJlcjtcclxuICAgIC8qKiBPdmVycmlkZSBwaXRjaCBvZiB2b2ljZSAqL1xyXG4gICAgcGl0Y2g/ICAgICA6IG51bWJlcjtcclxuICAgIC8qKiBPdmVycmlkZSByYXRlIG9mIHZvaWNlICovXHJcbiAgICByYXRlPyAgICAgIDogbnVtYmVyO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxudHlwZSBWb3hLZXkgPSBzdHJpbmcgfCBudW1iZXI7XHJcblxyXG4vKiogU3ludGhlc2l6ZXMgc3BlZWNoIGJ5IGR5bmFtaWNhbGx5IGxvYWRpbmcgYW5kIHBpZWNpbmcgdG9nZXRoZXIgdm9pY2UgZmlsZXMgKi9cclxuY2xhc3MgVm94RW5naW5lXHJcbntcclxuICAgIC8qKiBMaXN0IG9mIGltcHVsc2UgcmVzcG9uc2VzIHRoYXQgY29tZSB3aXRoIFJBRyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBSRVZFUkJTIDogRGljdGlvbmFyeTxzdHJpbmc+ID0ge1xyXG4gICAgICAgICcnICAgICAgICAgICAgICAgICAgICAgOiAnTm9uZScsXHJcbiAgICAgICAgJ2lyLnN0YWxiYW5zLndhdicgICAgICA6ICdUaGUgTGFkeSBDaGFwZWwsIFN0IEFsYmFucyBDYXRoZWRyYWwnLFxyXG4gICAgICAgICdpci5taWRkbGVfdHVubmVsLndhdicgOiAnSW5ub2NlbnQgUmFpbHdheSBUdW5uZWwsIEVkaW5idXJnaCcsXHJcbiAgICAgICAgJ2lyLmdyYW5nZS1jZW50cmUud2F2JyA6ICdHcmFuZ2Ugc3RvbmUgY2lyY2xlLCBDb3VudHkgTGltZXJpY2snXHJcbiAgICB9O1xyXG5cclxuICAgIC8qKiBUaGUgY29yZSBhdWRpbyBjb250ZXh0IHRoYXQgaGFuZGxlcyBhdWRpbyBlZmZlY3RzIGFuZCBwbGF5YmFjayAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBhdWRpb0NvbnRleHQgOiBBdWRpb0NvbnRleHQ7XHJcbiAgICAvKiogQXVkaW8gbm9kZSB0aGF0IGFtcGxpZmllcyBvciBhdHRlbnVhdGVzIHZvaWNlICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGdhaW5Ob2RlICAgICA6IEdhaW5Ob2RlO1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhcHBsaWVzIHRoZSB0YW5ub3kgZmlsdGVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGZpbHRlck5vZGUgICA6IEJpcXVhZEZpbHRlck5vZGU7XHJcbiAgICAvKipcclxuICAgICAqIENhY2hlIG9mIGltcHVsc2UgcmVzcG9uc2VzIHJldmVyYiBub2RlcywgZm9yIHJldmVyYi4gVGhpcyB1c2VkIHRvIGJlIGEgZGljdGlvbmFyeVxyXG4gICAgICogb2YgQXVkaW9CdWZmZXJzLCBidXQgQ29udm9sdmVyTm9kZXMgY2Fubm90IGhhdmUgdGhlaXIgYnVmZmVycyBjaGFuZ2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGltcHVsc2VzIDogRGljdGlvbmFyeTxDb252b2x2ZXJOb2RlPiA9IHt9O1xyXG4gICAgLyoqIFJlbGF0aXZlIHBhdGggdG8gZmV0Y2ggaW1wdWxzZSByZXNwb25zZSBhbmQgY2hpbWUgZmlsZXMgZnJvbSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkYXRhUGF0aCA6IHN0cmluZztcclxuXHJcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaGFzIGF1ZGlibHkgYmVndW4gKi9cclxuICAgIHB1YmxpYyAgb25zcGVhaz8gICAgICAgICA6ICgpID0+IHZvaWQ7XHJcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaGFzIGVuZGVkICovXHJcbiAgICBwdWJsaWMgIG9uc3RvcD8gICAgICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhpcyBlbmdpbmUgaXMgY3VycmVudGx5IHJ1bm5pbmcgYW5kIHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgIGlzU3BlYWtpbmcgICAgICAgOiBib29sZWFuICAgICAgPSBmYWxzZTtcclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgZW5naW5lIGhhcyBiZWd1biBzcGVha2luZyBmb3IgYSBjdXJyZW50IHNwZWVjaCAqL1xyXG4gICAgcHJpdmF0ZSBiZWd1blNwZWFraW5nICAgIDogYm9vbGVhbiAgICAgID0gZmFsc2U7XHJcbiAgICAvKiogUmVmZXJlbmNlIG51bWJlciBmb3IgdGhlIGN1cnJlbnQgcHVtcCB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSBwdW1wVGltZXIgICAgICAgIDogbnVtYmVyICAgICAgID0gMDtcclxuICAgIC8qKiBUcmFja3MgdGhlIGF1ZGlvIGNvbnRleHQncyB3YWxsLWNsb2NrIHRpbWUgdG8gc2NoZWR1bGUgbmV4dCBjbGlwICovXHJcbiAgICBwcml2YXRlIG5leHRCZWdpbiAgICAgICAgOiBudW1iZXIgICAgICAgPSAwO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHBlbmRpbmcgcmVxdWVzdHMsIGFzIGEgRklGTyBxdWV1ZSAqL1xyXG4gICAgcHJpdmF0ZSBwZW5kaW5nUmVxcyAgICAgIDogVm94UmVxdWVzdFtdID0gW107XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBjdXJyZW50bHkgc2NoZWR1bGVkIGF1ZGlvIGJ1ZmZlcnMgKi9cclxuICAgIHByaXZhdGUgc2NoZWR1bGVkQnVmZmVycyA6IEF1ZGlvQnVmZmVyU291cmNlTm9kZVtdID0gW107XHJcbiAgICAvKiogTGlzdCBvZiB2b3ggSURzIGN1cnJlbnRseSBiZWluZyBydW4gdGhyb3VnaCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50SWRzPyAgICAgIDogVm94S2V5W107XHJcbiAgICAvKiogU3BlZWNoIHNldHRpbmdzIGN1cnJlbnRseSBiZWluZyB1c2VkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRTZXR0aW5ncz8gOiBTcGVlY2hTZXR0aW5ncztcclxuICAgIC8qKiBSZXZlcmIgbm9kZSBjdXJyZW50bHkgYmVpbmcgdXNlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50UmV2ZXJiPyAgIDogQ29udm9sdmVyTm9kZTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZGF0YVBhdGg6IHN0cmluZyA9ICdkYXRhL3ZveCcpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dXAgdGhlIGNvcmUgYXVkaW8gY29udGV4dFxyXG5cclxuICAgICAgICAvLyBAdHMtaWdub3JlIC0gRGVmaW5pbmcgdGhlc2UgaW4gV2luZG93IGludGVyZmFjZSBkb2VzIG5vdCB3b3JrXHJcbiAgICAgICAgbGV0IGF1ZGlvQ29udGV4dCAgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgYXVkaW9Db250ZXh0KCk7XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5hdWRpb0NvbnRleHQpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGdldCBhdWRpbyBjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIG5vZGVzXHJcblxyXG4gICAgICAgIHRoaXMuZGF0YVBhdGggICA9IGRhdGFQYXRoO1xyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcclxuICAgICAgICB0aGlzLmZpbHRlck5vZGUgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCaXF1YWRGaWx0ZXIoKTtcclxuXHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLnR5cGUgICAgICA9ICdoaWdocGFzcyc7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLlEudmFsdWUgICA9IDAuNDtcclxuXHJcbiAgICAgICAgdGhpcy5nYWluTm9kZS5jb25uZWN0KHRoaXMuZmlsdGVyTm9kZSk7XHJcbiAgICAgICAgLy8gUmVzdCBvZiBub2RlcyBnZXQgY29ubmVjdGVkIHdoZW4gc3BlYWsgaXMgY2FsbGVkXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCZWdpbnMgbG9hZGluZyBhbmQgc3BlYWtpbmcgYSBzZXQgb2Ygdm94IGZpbGVzLiBTdG9wcyBhbnkgc3BlZWNoLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZHMgTGlzdCBvZiB2b3ggaWRzIHRvIGxvYWQgYXMgZmlsZXMsIGluIHNwZWFraW5nIG9yZGVyXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgVm9pY2Ugc2V0dGluZ3MgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzcGVhayhpZHM6IFZveEtleVtdLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTUEVBSzonLCBpZHMsIHNldHRpbmdzKTtcclxuXHJcbiAgICAgICAgLy8gU2V0IHN0YXRlXHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgICAgICA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5iZWd1blNwZWFraW5nICAgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRJZHMgICAgICA9IGlkcztcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzO1xyXG5cclxuICAgICAgICAvLyBTZXQgcmV2ZXJiXHJcblxyXG4gICAgICAgIGlmICggU3RyaW5ncy5pc051bGxPckVtcHR5KHNldHRpbmdzLnZveFJldmVyYikgKVxyXG4gICAgICAgICAgICB0aGlzLnNldFJldmVyYigpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBmaWxlICAgPSBzZXR0aW5ncy52b3hSZXZlcmIhO1xyXG4gICAgICAgICAgICBsZXQgcmV2ZXJiID0gdGhpcy5pbXB1bHNlc1tmaWxlXTtcclxuXHJcbiAgICAgICAgICAgIGlmICghcmV2ZXJiKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAvLyBNYWtlIHN1cmUgcmV2ZXJiIGlzIG9mZiBmaXJzdCwgZWxzZSBjbGlwcyB3aWxsIHF1ZXVlIGluIHRoZSBhdWRpb1xyXG4gICAgICAgICAgICAgICAgLy8gYnVmZmVyIGFuZCBhbGwgc3VkZGVubHkgcGxheSBhdCB0aGUgc2FtZSB0aW1lLCB3aGVuIHJldmVyYiBsb2Fkcy5cclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0UmV2ZXJiKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgZmV0Y2goYCR7dGhpcy5kYXRhUGF0aH0vJHtmaWxlfWApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIHJlcyA9PiByZXMuYXJyYXlCdWZmZXIoKSApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIGJ1ZiA9PiBTb3VuZHMuZGVjb2RlKHRoaXMuYXVkaW9Db250ZXh0LCBidWYpIClcclxuICAgICAgICAgICAgICAgICAgICAudGhlbiggaW1wID0+IHRoaXMuY3JlYXRlUmV2ZXJiKGZpbGUsIGltcCkgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFJldmVyYihyZXZlcmIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHZvbHVtZVxyXG5cclxuICAgICAgICBsZXQgdm9sdW1lID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgMSk7XHJcblxyXG4gICAgICAgIC8vIFJlbWFwcyB0aGUgMS4xLi4uMS45IHJhbmdlIHRvIDIuLi4xMFxyXG4gICAgICAgIGlmICh2b2x1bWUgPiAxKVxyXG4gICAgICAgICAgICB2b2x1bWUgPSAodm9sdW1lICogMTApIC0gOTtcclxuXHJcbiAgICAgICAgdGhpcy5nYWluTm9kZS5nYWluLnZhbHVlID0gdm9sdW1lO1xyXG5cclxuICAgICAgICAvLyBTZXQgY2hpbWUsIGF0IGZvcmNlZCBwbGF5YmFjayByYXRlIG9mIDFcclxuXHJcbiAgICAgICAgaWYgKCAhU3RyaW5ncy5pc051bGxPckVtcHR5KHNldHRpbmdzLnZveENoaW1lKSApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGF0aCAgICAgID0gYCR7dGhpcy5kYXRhUGF0aH0vJHtzZXR0aW5ncy52b3hDaGltZSF9YDtcclxuICAgICAgICAgICAgbGV0IHJlcSAgICAgICA9IG5ldyBWb3hSZXF1ZXN0KHBhdGgsIDAsIHRoaXMuYXVkaW9Db250ZXh0KTtcclxuICAgICAgICAgICAgcmVxLmZvcmNlUmF0ZSA9IDE7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2gocmVxKTtcclxuICAgICAgICAgICAgaWRzLnVuc2hpZnQoMS4wKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEJlZ2luIHRoZSBwdW1wIGxvb3AuIE9uIGlPUywgdGhlIGNvbnRleHQgbWF5IGhhdmUgdG8gYmUgcmVzdW1lZCBmaXJzdFxyXG5cclxuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnKVxyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKS50aGVuKCAoKSA9PiB0aGlzLnB1bXAoKSApO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5wdW1wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHBsYXlpbmcgYW55IGN1cnJlbnRseSBzcG9rZW4gc3BlZWNoIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gQWxyZWFkeSBzdG9wcGVkPyBEbyBub3QgY29udGludWVcclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmdcclxuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wdW1wVGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gQ2FuY2VsIGFsbCBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5mb3JFYWNoKCByID0+IHIuY2FuY2VsKCkgKTtcclxuXHJcbiAgICAgICAgLy8gS2lsbCBhbmQgZGVyZWZlcmVuY2UgYW55IGN1cnJlbnRseSBwbGF5aW5nIGZpbGVcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuZm9yRWFjaChub2RlID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBub2RlLnN0b3AoKTtcclxuICAgICAgICAgICAgbm9kZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICAgICAgICA9IDA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLnBlbmRpbmdSZXFzICAgICAgPSBbXTtcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMgPSBbXTtcclxuXHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFNUT1BQRUQnKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHVtcHMgdGhlIHNwZWVjaCBxdWV1ZSwgYnkga2VlcGluZyB1cCB0byAxMCBmZXRjaCByZXF1ZXN0cyBmb3Igdm9pY2UgZmlsZXMgZ29pbmcsXHJcbiAgICAgKiBhbmQgdGhlbiBmZWVkaW5nIHRoZWlyIGRhdGEgKGluIGVuZm9yY2VkIG9yZGVyKSB0byB0aGUgYXVkaW8gY2hhaW4sIG9uZSBhdCBhIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcHVtcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIHRoZSBlbmdpbmUgaGFzIHN0b3BwZWQsIGRvIG5vdCBwcm9jZWVkLlxyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nIHx8ICF0aGlzLmN1cnJlbnRJZHMgfHwgIXRoaXMuY3VycmVudFNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzY2hlZHVsZSBmdWxmaWxsZWQgcmVxdWVzdHMgaW50byB0aGUgYXVkaW8gYnVmZmVyLCBpbiBGSUZPIG9yZGVyXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZSgpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBmaWxsIGFueSBmcmVlIHBlbmRpbmcgc2xvdHMgd2l0aCBuZXcgcmVxdWVzdHNcclxuICAgICAgICBsZXQgbmV4dERlbGF5ID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuY3VycmVudElkc1swXSAmJiB0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8IDEwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IHRoaXMuY3VycmVudElkcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMga2V5IGlzIGEgbnVtYmVyLCBpdCdzIGFuIGFtb3VudCBvZiBzaWxlbmNlLCBzbyBhZGQgaXQgYXMgdGhlXHJcbiAgICAgICAgICAgIC8vIHBsYXliYWNrIGRlbGF5IGZvciB0aGUgbmV4dCBwbGF5YWJsZSByZXF1ZXN0IChpZiBhbnkpLlxyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ251bWJlcicpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5leHREZWxheSArPSBrZXk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbGV0IHBhdGggPSBgJHt0aGlzLmN1cnJlbnRTZXR0aW5ncy52b3hQYXRofS8ke2tleX0ubXAzYDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ1JlcXMucHVzaCggbmV3IFZveFJlcXVlc3QocGF0aCwgbmV4dERlbGF5LCB0aGlzLmF1ZGlvQ29udGV4dCkgKTtcclxuICAgICAgICAgICAgbmV4dERlbGF5ID0gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0b3AgcHVtcGluZyB3aGVuIHdlJ3JlIG91dCBvZiBJRHMgdG8gcXVldWUgYW5kIG5vdGhpbmcgaXMgcGxheWluZ1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZHMubGVuZ3RoICAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ1JlcXMubGVuZ3RoICAgICAgPD0gMClcclxuICAgICAgICBpZiAodGhpcy5zY2hlZHVsZWRCdWZmZXJzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIHRoaXMucHVtcFRpbWVyID0gc2V0VGltZW91dCh0aGlzLnB1bXAuYmluZCh0aGlzKSwgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RvcCBzY2hlZHVsaW5nIGlmIHRoZXJlIGFyZSBubyBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgaWYgKCF0aGlzLnBlbmRpbmdSZXFzWzBdIHx8ICF0aGlzLnBlbmRpbmdSZXFzWzBdLmlzRG9uZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCBzY2hlZHVsZSBpZiBtb3JlIHRoYW4gNSBub2RlcyBhcmUsIGFzIG5vdCB0byBibG93IGFueSBidWZmZXJzXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPiA1KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCByZXEgPSB0aGlzLnBlbmRpbmdSZXFzLnNoaWZ0KCkhO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgbmV4dCByZXF1ZXN0IGVycm9yZWQgb3V0IChidWZmZXIgbWlzc2luZyksIHNraXAgaXRcclxuICAgICAgICBpZiAoIXJlcS5idWZmZXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgU0tJUFBFRDonLCByZXEucGF0aCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNjaGVkdWxlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGlzIGlzIHRoZSBmaXJzdCBjbGlwIGJlaW5nIHBsYXllZCwgc3RhcnQgZnJvbSBjdXJyZW50IHdhbGwtY2xvY2tcclxuICAgICAgICBpZiAodGhpcy5uZXh0QmVnaW4gPT09IDApXHJcbiAgICAgICAgICAgIHRoaXMubmV4dEJlZ2luID0gdGhpcy5hdWRpb0NvbnRleHQuY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBRVUVVRUQ6JywgcmVxLnBhdGgsIHJlcS5idWZmZXIuZHVyYXRpb24sIHRoaXMubmV4dEJlZ2luKTtcclxuXHJcbiAgICAgICAgLy8gQmFzZSBsYXRlbmN5IG5vdCBhdmFpbGFibGUgaW4gc29tZSBicm93c2Vyc1xyXG4gICAgICAgIGxldCBsYXRlbmN5ID0gKHRoaXMuYXVkaW9Db250ZXh0LmJhc2VMYXRlbmN5IHx8IDAuMDEpICsgMC4xNTtcclxuICAgICAgICBsZXQgbm9kZSAgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgIGxldCByYXRlICAgID0gcmVxLmZvcmNlUmF0ZSB8fCB0aGlzLmN1cnJlbnRTZXR0aW5ncyEucmF0ZSB8fCAxO1xyXG4gICAgICAgIG5vZGUuYnVmZmVyID0gcmVxLmJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8gUmVtYXAgcmF0ZSBmcm9tIDAuMS4uMS45IHRvIDAuOC4uMS41XHJcbiAgICAgICAgaWYgICAgICAocmF0ZSA8IDEpIHJhdGUgPSAocmF0ZSAqIDAuMikgKyAwLjg7XHJcbiAgICAgICAgZWxzZSBpZiAocmF0ZSA+IDEpIHJhdGUgPSAocmF0ZSAqIDAuNSkgKyAwLjU7XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSBkZWxheSBhbmQgZHVyYXRpb24gYmFzZWQgb24gcGxheWJhY2sgcmF0ZVxyXG4gICAgICAgIGxldCBkZWxheSAgICA9IHJlcS5kZWxheSAqICgxIC8gcmF0ZSk7XHJcbiAgICAgICAgbGV0IGR1cmF0aW9uID0gbm9kZS5idWZmZXIuZHVyYXRpb24gKiAoMSAvIHJhdGUpO1xyXG5cclxuICAgICAgICBub2RlLnBsYXliYWNrUmF0ZS52YWx1ZSA9IHJhdGU7XHJcbiAgICAgICAgbm9kZS5jb25uZWN0KHRoaXMuZ2Fpbk5vZGUpO1xyXG4gICAgICAgIG5vZGUuc3RhcnQodGhpcy5uZXh0QmVnaW4gKyBkZWxheSk7XHJcblxyXG4gICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5wdXNoKG5vZGUpO1xyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICs9IChkdXJhdGlvbiArIGRlbGF5IC0gbGF0ZW5jeSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUgb24tZmlyc3Qtc3BlYWsgZXZlbnRcclxuICAgICAgICBpZiAoIXRoaXMuYmVndW5TcGVha2luZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYmVndW5TcGVha2luZyA9IHRydWU7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnNwZWFrKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnNwZWFrKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYXZlIHRoaXMgYnVmZmVyIG5vZGUgcmVtb3ZlIGl0c2VsZiBmcm9tIHRoZSBzY2hlZHVsZSB3aGVuIGRvbmVcclxuICAgICAgICBub2RlLm9uZW5kZWQgPSBfID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgRU5ERUQ6JywgcmVxLnBhdGgpO1xyXG4gICAgICAgICAgICBsZXQgaWR4ID0gdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmluZGV4T2Yobm9kZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSlcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5zcGxpY2UoaWR4LCAxKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlUmV2ZXJiKGZpbGU6IHN0cmluZywgaW1wdWxzZTogQXVkaW9CdWZmZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuaW1wdWxzZXNbZmlsZV0gICAgICAgICAgID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQ29udm9sdmVyKCk7XHJcbiAgICAgICAgdGhpcy5pbXB1bHNlc1tmaWxlXS5idWZmZXIgICAgPSBpbXB1bHNlO1xyXG4gICAgICAgIHRoaXMuaW1wdWxzZXNbZmlsZV0ubm9ybWFsaXplID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnNldFJldmVyYih0aGlzLmltcHVsc2VzW2ZpbGVdKTtcclxuICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggUkVWRVJCIExPQURFRDonLCBmaWxlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldFJldmVyYihyZXZlcmI/OiBDb252b2x2ZXJOb2RlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UmV2ZXJiKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UmV2ZXJiLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UmV2ZXJiID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLmRpc2Nvbm5lY3QoKTtcclxuXHJcbiAgICAgICAgaWYgKHJldmVyYilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFJldmVyYiA9IHJldmVyYjtcclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJOb2RlLmNvbm5lY3QocmV2ZXJiKTtcclxuICAgICAgICAgICAgcmV2ZXJiLmNvbm5lY3QodGhpcy5hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgcmVxdWVzdCBmb3IgYSB2b3ggZmlsZSwgaW1tZWRpYXRlbHkgYmVndW4gb24gY3JlYXRpb24gKi9cclxuY2xhc3MgVm94UmVxdWVzdFxyXG57XHJcbiAgICAvKiogUmVsYXRpdmUgcmVtb3RlIHBhdGggb2YgdGhpcyB2b2ljZSBmaWxlIHJlcXVlc3QgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgcGF0aCAgICA6IHN0cmluZztcclxuICAgIC8qKiBBbW91bnQgb2Ygc2Vjb25kcyB0byBkZWxheSB0aGUgcGxheWJhY2sgb2YgdGhpcyByZXF1ZXN0ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGRlbGF5ICAgOiBudW1iZXI7XHJcbiAgICAvKiogQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQgOiBBdWRpb0NvbnRleHQ7XHJcbiAgICAvKiogQWJvcnQgY29udHJvbGxlciB0byBhbGxvdyB0aGUgZmV0Y2ggdG8gYmUgYWJvcnRlZCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBhYm9ydCAgIDogQWJvcnRDb250cm9sbGVyO1xyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBkb25lIGFuZCByZWFkeSBmb3IgaGFuZGxpbmcgKGV2ZW4gaWYgZmFpbGVkKSAqL1xyXG4gICAgcHVibGljIGlzRG9uZSAgICAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogUmF3IGF1ZGlvIGRhdGEgZnJvbSB0aGUgbG9hZGVkIGZpbGUsIGlmIGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljIGJ1ZmZlcj8gICAgOiBBdWRpb0J1ZmZlcjtcclxuICAgIC8qKiBQbGF5YmFjayByYXRlIHRvIGZvcmNlIHRoaXMgY2xpcCB0byBwbGF5IGF0ICovXHJcbiAgICBwdWJsaWMgZm9yY2VSYXRlPyA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGF0aDogc3RyaW5nLCBkZWxheTogbnVtYmVyLCBjb250ZXh0OiBBdWRpb0NvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFUVVFU1Q6JywgcGF0aCk7XHJcbiAgICAgICAgdGhpcy5jb250ZXh0ID0gY29udGV4dDtcclxuICAgICAgICB0aGlzLnBhdGggICAgPSBwYXRoO1xyXG4gICAgICAgIHRoaXMuZGVsYXkgICA9IGRlbGF5O1xyXG4gICAgICAgIHRoaXMuYWJvcnQgICA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcclxuXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vd2ViL3VwZGF0ZXMvMjAxNy8wOS9hYm9ydGFibGUtZmV0Y2hcclxuICAgICAgICBmZXRjaChwYXRoLCB7IHNpZ25hbCA6IHRoaXMuYWJvcnQuc2lnbmFsIH0pXHJcbiAgICAgICAgICAgIC50aGVuICggdGhpcy5vbkZ1bGZpbGwuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICApO1xyXG5cclxuICAgICAgICAvLyBUaW1lb3V0IGFsbCBmZXRjaGVzIGJ5IDEwIHNlY29uZHNcclxuICAgICAgICBzZXRUaW1lb3V0KF8gPT4gdGhpcy5hYm9ydC5hYm9ydCgpLCAxMCAqIDEwMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYW5jZWxzIHRoaXMgcmVxdWVzdCBmcm9tIHByb2NlZWRpbmcgYW55IGZ1cnRoZXIgKi9cclxuICAgIHB1YmxpYyBjYW5jZWwoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmFib3J0LmFib3J0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBkZWNvZGluZyB0aGUgbG9hZGVkIE1QMyB2b2ljZSBmaWxlIHRvIHJhdyBhdWRpbyBkYXRhICovXHJcbiAgICBwcml2YXRlIG9uRnVsZmlsbChyZXM6IFJlc3BvbnNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXJlcy5vaylcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoYFZPWCBOT1QgRk9VTkQ6ICR7cmVzLnN0YXR1c30gQCAke3RoaXMucGF0aH1gKTtcclxuXHJcbiAgICAgICAgcmVzLmFycmF5QnVmZmVyKCkudGhlbiggdGhpcy5vbkFycmF5QnVmZmVyLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVGFrZXMgdGhlIGFycmF5IGJ1ZmZlciBmcm9tIHRoZSBmdWxmaWxsZWQgZmV0Y2ggYW5kIGRlY29kZXMgaXQgKi9cclxuICAgIHByaXZhdGUgb25BcnJheUJ1ZmZlcihidWZmZXI6IEFycmF5QnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTb3VuZHMuZGVjb2RlKHRoaXMuY29udGV4dCwgYnVmZmVyKVxyXG4gICAgICAgICAgICAudGhlbiAoIHRoaXMub25EZWNvZGUuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIHRoZSBmZXRjaGVkIGJ1ZmZlciBpcyBkZWNvZGVkIHN1Y2Nlc3NmdWxseSAqL1xyXG4gICAgcHJpdmF0ZSBvbkRlY29kZShidWZmZXI6IEF1ZGlvQnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlcjtcclxuICAgICAgICB0aGlzLmlzRG9uZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGxlZCBpZiB0aGUgZmV0Y2ggb3IgZGVjb2RlIHN0YWdlcyBmYWlsICovXHJcbiAgICBwcml2YXRlIG9uRXJyb3IoZXJyOiBhbnkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdSRVFVRVNUIEZBSUw6JywgZXJyKTtcclxuICAgICAgICB0aGlzLmlzRG9uZSA9IHRydWU7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLyBUT0RPOiBNYWtlIGFsbCB2aWV3cyB1c2UgdGhpcyBjbGFzc1xyXG4vKiogQmFzZSBjbGFzcyBmb3IgYSB2aWV3OyBhbnl0aGluZyB3aXRoIGEgYmFzZSBET00gZWxlbWVudCAqL1xyXG5hYnN0cmFjdCBjbGFzcyBWaWV3QmFzZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgdmlldydzIHByaW1hcnkgRE9NIGVsZW1lbnQgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyB0aGlzIGJhc2UgdmlldywgYXR0YWNoaW5nIGl0IHRvIHRoZSBlbGVtZW50IG1hdGNoaW5nIHRoZSBnaXZlbiBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKGRvbVF1ZXJ5OiBzdHJpbmcgfCBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBpZiAodHlwZW9mIGRvbVF1ZXJ5ID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgdGhpcy5kb20gPSBET00ucmVxdWlyZShkb21RdWVyeSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmRvbSA9IGRvbVF1ZXJ5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoaXMgdmlldydzIGNoaWxkIGVsZW1lbnQgbWF0Y2hpbmcgdGhlIGdpdmVuIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgYXR0YWNoPFQgZXh0ZW5kcyBIVE1MRWxlbWVudD4ocXVlcnk6IHN0cmluZykgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5yZXF1aXJlKHF1ZXJ5LCB0aGlzLmRvbSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy88cmVmZXJlbmNlIHBhdGg9XCJ2aWV3QmFzZS50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgZGlzY2xhaW1lciBzY3JlZW4gKi9cclxuY2xhc3MgRGlzY2xhaW1lciBleHRlbmRzIFZpZXdCYXNlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIFwiY29udGludWVcIiBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuRGlzbWlzcyA6IEhUTUxCdXR0b25FbGVtZW50ID0gdGhpcy5hdHRhY2goJyNidG5EaXNtaXNzJyk7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbGFzdCBmb2N1c2VkIGVsZW1lbnQsIGlmIGFueSAqL1xyXG4gICAgcHJpdmF0ZSBsYXN0QWN0aXZlPyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJyNkaXNjbGFpbWVyU2NyZWVuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE9wZW5zIHRoZSBkaXNjbGFpbWVyIGZvciBmaXJzdCB0aW1lIHVzZXJzICovXHJcbiAgICBwdWJsaWMgZGlzY2xhaW0oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoUkFHLmNvbmZpZy5yZWFkRGlzY2xhaW1lcilcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmxhc3RBY3RpdmUgICAgICAgICA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuICAgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiAgICAgICAgID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5idG5EaXNtaXNzLm9uY2xpY2sgPSB0aGlzLm9uRGlzbWlzcy5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuRGlzbWlzcy5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQZXJzaXN0cyB0aGUgZGlzbWlzc2FsIHRvIHN0b3JhZ2UgYW5kIHJlc3RvcmVzIHRoZSBtYWluIHNjcmVlbiAqL1xyXG4gICAgcHJpdmF0ZSBvbkRpc21pc3MoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuY29uZmlnLnJlYWREaXNjbGFpbWVyID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gICAgICAgICAgID0gdHJ1ZTtcclxuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gICAgID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5idG5EaXNtaXNzLm9uY2xpY2sgICA9IG51bGw7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zYXZlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmxhc3RBY3RpdmUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RBY3RpdmUuZm9jdXMoKTtcclxuICAgICAgICAgICAgdGhpcy5sYXN0QWN0aXZlID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlIGVkaXRvciAqL1xyXG5jbGFzcyBFZGl0b3Jcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIGNvbnRhaW5lciBmb3IgdGhlIGVkaXRvciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgZGlhbG9nLCBpZiBhbnkgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFBpY2tlcj8gOiBQaWNrZXI7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBjdXJyZW50bHkgYmVpbmcgZWRpdGVkLCBpZiBhbnkgKi9cclxuICAgIC8vIERvIG5vdCBEUlk7IG5lZWRzIHRvIGJlIHBhc3NlZCB0byB0aGUgcGlja2VyIGZvciBjbGVhbmVyIGNvZGVcclxuICAgIHByaXZhdGUgZG9tRWRpdGluZz8gICAgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tID0gRE9NLnJlcXVpcmUoJyNlZGl0b3InKTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmNsaWNrID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93Lm9ucmVzaXplICAgICAgID0gdGhpcy5vblJlc2l6ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tLm9uc2Nyb2xsICAgICA9IHRoaXMub25TY3JvbGwuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS50ZXh0Q29udGVudCAgPSBMLkVESVRPUl9JTklUO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyB0aGUgZWRpdG9yIHdpdGggYSByb290IHBocmFzZXNldCByZWZlcmVuY2UsIGFuZCBleHBhbmRzIGl0IGludG8gSFRNTCAqL1xyXG4gICAgcHVibGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJzxwaHJhc2VzZXQgcmVmPVwicm9vdFwiIC8+JztcclxuXHJcbiAgICAgICAgUkFHLnBocmFzZXIucHJvY2Vzcyh0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5hdHRhY2hDb250cm9scygpO1xyXG5cclxuICAgICAgICAvLyBGb3Igc2Nyb2xsLXBhc3QgcGFkZGluZyB1bmRlciB0aGUgcGhyYXNlXHJcbiAgICAgICAgbGV0IHBhZGRpbmcgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgcGFkZGluZy5jbGFzc05hbWUgPSAnYm90dG9tUGFkZGluZyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHBhZGRpbmcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXByb2Nlc3NlcyBhbGwgcGhyYXNlc2V0IGVsZW1lbnRzIG9mIHRoZSBnaXZlbiByZWYsIGlmIHRoZWlyIGluZGV4IGhhcyBjaGFuZ2VkICovXHJcbiAgICBwdWJsaWMgcmVmcmVzaFBocmFzZXNldChyZWY6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTm90ZSwgdGhpcyBjb3VsZCBwb3RlbnRpYWxseSBidWcgb3V0IGlmIGEgcGhyYXNlc2V0J3MgZGVzY2VuZGFudCByZWZlcmVuY2VzXHJcbiAgICAgICAgLy8gdGhlIHNhbWUgcGhyYXNlc2V0IChyZWN1cnNpb24pLiBCdXQgdGhpcyBpcyBva2F5IGJlY2F1c2UgcGhyYXNlc2V0cyBzaG91bGRcclxuICAgICAgICAvLyBuZXZlciBpbmNsdWRlIHRoZW1zZWx2ZXMsIGV2ZW4gZXZlbnR1YWxseS5cclxuXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChgc3BhbltkYXRhLXR5cGU9cGhyYXNlc2V0XVtkYXRhLXJlZj0ke3JlZn1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goXyA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCAgICA9IF8gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBsZXQgbmV3RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3BocmFzZXNldCcpO1xyXG4gICAgICAgICAgICAgICAgbGV0IGNoYW5jZSAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddO1xyXG5cclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuc2V0QXR0cmlidXRlKCdyZWYnLCByZWYpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjaGFuY2UpXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NoYW5jZScsIGNoYW5jZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5wYXJlbnRFbGVtZW50IS5yZXBsYWNlQ2hpbGQobmV3RWxlbWVudCwgZWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKG5ld0VsZW1lbnQucGFyZW50RWxlbWVudCEpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdHRhY2hDb250cm9scygpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBzdGF0aWMgTm9kZUxpc3Qgb2YgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gcXVlcnkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IFF1ZXJ5IHN0cmluZyB0byBhZGQgb250byB0aGUgYHNwYW5gIHNlbGVjdG9yXHJcbiAgICAgKiBAcmV0dXJucyBOb2RlIGxpc3Qgb2YgYWxsIGVsZW1lbnRzIG1hdGNoaW5nIHRoZSBnaXZlbiBzcGFuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRFbGVtZW50c0J5UXVlcnkocXVlcnk6IHN0cmluZykgOiBOb2RlTGlzdFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuJHtxdWVyeX1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UncyByb290IERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlKCkgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UgaW4gdGhlIGVkaXRvciBhcyB0ZXh0LCBleGNsdWRpbmcgdGhlIGhpZGRlbiBwYXJ0cyAqL1xyXG4gICAgcHVibGljIGdldFRleHQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFsbCBwaHJhc2UgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHR5cGUsIGFuZCBzZXRzIHRoZWlyIHRleHQgdG8gZ2l2ZW4gdmFsdWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHR5cGUgT3JpZ2luYWwgWE1MIG5hbWUgb2YgZWxlbWVudHMgdG8gcmVwbGFjZSBjb250ZW50cyBvZlxyXG4gICAgICogQHBhcmFtIHZhbHVlIE5ldyB0ZXh0IGZvciB0aGUgZm91bmQgZWxlbWVudHMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRFbGVtZW50c1RleHQodHlwZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT0ke3R5cGV9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIGFueSBjdXJyZW50bHkgb3BlbiBlZGl0b3IgZGlhbG9ncyAqL1xyXG4gICAgcHVibGljIGNsb3NlRGlhbG9nKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmNsb3NlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcucmVtb3ZlQXR0cmlidXRlKCdlZGl0aW5nJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScsICdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgYXR0YWNoZXMgVUkgY29udHJvbHMgZm9yIGNlcnRhaW4gcGhyYXNlIGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIGF0dGFjaENvbnRyb2xzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtdHlwZT1waHJhc2VzZXRdJykuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAgICAgIFBocmFzZXNldEJ1dHRvbi5jcmVhdGVBbmRBdHRhY2goc3BhbilcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1jaGFuY2VdJykuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5jcmVhdGVBbmRBdHRhY2goc3Bhbik7XHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLnVwZGF0ZShzcGFuIGFzIEhUTUxFbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhIGNsaWNrIGFueXdoZXJlIGluIHRoZSB3aW5kb3cgZGVwZW5kaW5nIG9uIHRoZSBjb250ZXh0ICovXHJcbiAgICBwcml2YXRlIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHRhcmdldCA/IHRhcmdldC5kYXRhc2V0Wyd0eXBlJ10gICAgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgbGV0IHBpY2tlciA9IHR5cGUgICA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmICghdGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIG9mIGlubmVyIGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKCB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdpbm5lcicpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBpbm5lciBkb2N1bWVudCBvciB1bm93bmVkIGVsZW1lbnRcclxuICAgICAgICBpZiAoICFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGVsZW1lbnQgb2YgYWxyZWFkeSBvcGVuIHBpY2tlcnNcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlciApXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIuZG9tLmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbnkgb3BlbiBlZGl0b3JzXHJcbiAgICAgICAgbGV0IHByZXZUYXJnZXQgPSB0aGlzLmRvbUVkaXRpbmc7XHJcbiAgICAgICAgdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBEb24ndCBoYW5kbGUgcGhyYXNlIG9yIHBocmFzZXNldHMgLSBvbmx5IHZpYSB0aGVpciBidXR0b25zXHJcbiAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2UnIHx8IHR5cGUgPT09ICdwaHJhc2VzZXQnKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElmIGNsaWNraW5nIHRoZSBlbGVtZW50IGFscmVhZHkgYmVpbmcgZWRpdGVkLCBkb24ndCByZW9wZW5cclxuICAgICAgICBpZiAodGFyZ2V0ID09PSBwcmV2VGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCB0b2dnbGUgICAgICAgPSB0YXJnZXQuY2xvc2VzdCgnLnRvZ2dsZScpICAgICAgIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCBjaG9vc2VQaHJhc2UgPSB0YXJnZXQuY2xvc2VzdCgnLmNob29zZVBocmFzZScpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgY29sbGFwc2libGUgZWxlbWVudHNcclxuICAgICAgICBpZiAodG9nZ2xlKVxyXG4gICAgICAgICAgICB0aGlzLnRvZ2dsZUNvbGxhcHNpYWJsZSh0b2dnbGUpO1xyXG5cclxuICAgICAgICAvLyBTcGVjaWFsIGNhc2UgZm9yIHBocmFzZXNldCBjaG9vc2VyXHJcbiAgICAgICAgZWxzZSBpZiAoY2hvb3NlUGhyYXNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gVE9ETzogQXNzZXJ0IGhlcmU/XHJcbiAgICAgICAgICAgIHRhcmdldCA9IGNob29zZVBocmFzZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgcGlja2VyID0gUkFHLnZpZXdzLmdldFBpY2tlcih0YXJnZXQuZGF0YXNldFsndHlwZSddISk7XHJcbiAgICAgICAgICAgIHRoaXMub3BlblBpY2tlcih0YXJnZXQsIHBpY2tlcik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBGaW5kIGFuZCBvcGVuIHBpY2tlciBmb3IgdGhlIHRhcmdldCBlbGVtZW50XHJcbiAgICAgICAgZWxzZSBpZiAodHlwZSAmJiBwaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMub3BlblBpY2tlcih0YXJnZXQsIHBpY2tlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlLWxheW91dCB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIG9uIHJlc2l6ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblJlc2l6ZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiBzY3JvbGwgKi9cclxuICAgIHByaXZhdGUgb25TY3JvbGwoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGxheW91dCBiZWhhdmluZyB3ZWlyZCB3aGVuIGlPUyBrZXlib2FyZCBpcyBvcGVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyLmhhc0ZvY3VzKCkpXHJcbiAgICAgICAgICAgIERPTS5ibHVyQWN0aXZlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZsaXBzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlLCBhbmQgcHJvcGFnYXRlcyB0aGUgbmV3IHN0YXRlIHRvIG90aGVyXHJcbiAgICAgKiBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmZXJlbmNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgQ29sbGFwc2libGUgZWxlbWVudCBiZWluZyB0b2dnbGVkXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdG9nZ2xlQ29sbGFwc2lhYmxlKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCByZWYgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCB0eXBlICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3R5cGUnKTtcclxuICAgICAgICBsZXQgY29sbGFwYXNlZCA9IHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG5cclxuICAgICAgICAvLyBQcm9wYWdhdGUgbmV3IGNvbGxhcHNlIHN0YXRlIHRvIGFsbCBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgYHNwYW5bZGF0YS10eXBlPSR7dHlwZX1dW2RhdGEtcmVmPSR7cmVmfV1bZGF0YS1jaGFuY2VdYFxyXG4gICAgICAgICkuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIENvbGxhcHNpYmxlcy5zZXQoc3BhbiBhcyBIVE1MRWxlbWVudCwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUudXBkYXRlKHNwYW4gYXMgSFRNTEVsZW1lbnQpO1xyXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3QgbW92ZSB0aGlzIHRvIENvbGxhcHNpYmxlcy5zZXQsIGFzIHN0YXRlIHNhdmUvbG9hZCBpcyBoYW5kbGVkXHJcbiAgICAgICAgICAgICAgICAvLyBvdXRzaWRlIGluIGJvdGggdXNhZ2VzIG9mIHNldENvbGxhcHNpYmxlLlxyXG4gICAgICAgICAgICAgICAgUkFHLnN0YXRlLnNldENvbGxhcHNlZChyZWYsICFjb2xsYXBhc2VkKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVucyBhIHBpY2tlciBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFZGl0b3IgZWxlbWVudCB0byBvcGVuIHRoZSBwaWNrZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gcGlja2VyIFBpY2tlciB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb3BlblBpY2tlcih0YXJnZXQ6IEhUTUxFbGVtZW50LCBwaWNrZXI6IFBpY2tlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGFyZ2V0LnNldEF0dHJpYnV0ZSgnZWRpdGluZycsICd0cnVlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlciA9IHBpY2tlcjtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgICAgPSB0YXJnZXQ7XHJcbiAgICAgICAgcGlja2VyLm9wZW4odGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuY2xhc3MgTWFycXVlZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYXJxdWVlJ3MgRE9NIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3BhbiBlbGVtZW50IGluIHRoZSBtYXJxdWVlLCB3aGVyZSB0aGUgdGV4dCBpcyBzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3BhbiA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgSUQgZm9yIHRoZSBzY3JvbGxpbmcgYW5pbWF0aW9uIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHRpbWVyICA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogQ3VycmVudCBvZmZzZXQgKGluIHBpeGVscykgb2YgdGhlIHNjcm9sbGluZyBtYXJxdWVlICovXHJcbiAgICBwcml2YXRlIG9mZnNldCA6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgPSBET00ucmVxdWlyZSgnI21hcnF1ZWUnKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHRoaXMuZG9tU3Bhbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIG1lc3NhZ2Ugb24gdGhlIHNjcm9sbGluZyBtYXJxdWVlLCBhbmQgc3RhcnRzIGFuaW1hdGluZyBpdCAqL1xyXG4gICAgcHVibGljIHNldChtc2c6IHN0cmluZywgYW5pbWF0ZTogYm9vbGVhbiA9IHRydWUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnRleHRDb250ZW50ICAgICA9IG1zZztcclxuICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcblxyXG4gICAgICAgIGlmICghYW5pbWF0ZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJIHRyaWVkIHRvIHVzZSBDU1MgYW5pbWF0aW9uIGZvciB0aGlzLCBidXQgY291bGRuJ3QgZmlndXJlIG91dCBob3cgZm9yIGFcclxuICAgICAgICAvLyBkeW5hbWljYWxseSBzaXplZCBlbGVtZW50IGxpa2UgdGhlIHNwYW4uXHJcbiAgICAgICAgdGhpcy5vZmZzZXQgPSB0aGlzLmRvbS5jbGllbnRXaWR0aDtcclxuICAgICAgICBsZXQgbGltaXQgICA9IC10aGlzLmRvbVNwYW4uY2xpZW50V2lkdGggLSAxMDA7XHJcbiAgICAgICAgbGV0IGFuaW0gICAgPSAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5vZmZzZXQgICAgICAgICAgICAgICAgICAtPSA2O1xyXG4gICAgICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtICA9IGB0cmFuc2xhdGVYKCR7dGhpcy5vZmZzZXR9cHgpYDtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9mZnNldCA8IGxpbWl0KVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVyID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3dhcCBpbiBuZXcgdGV4dCB3aXRob3V0IHJlc3RhcnRpbmcgdGhlIHNjcm9sbC4gV2hpbGUgdGhlIG1hcnF1ZWUgaXNcclxuICAgICAqIGFscmVhZHkgc2Nyb2xsaW5nLCB0aGUgbmV3IHRleHQgdGFrZXMgb3ZlciBpbiBwbGFjZSAodXNlZCBmb3Igd2FpdFxyXG4gICAgICogY291bnRkb3duIHRpY2tzLCBzbyB0aGV5IGRvbid0IGp1bXAgYmFjayB0byB0aGUgcmlnaHQgZWRnZSBldmVyeVxyXG4gICAgICogc2Vjb25kKTsgb3RoZXJ3aXNlIGl0IGJlaGF2ZXMgbGlrZSBhIGZyZXNoIHNldCgpLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U29mdChtc2c6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMudGltZXIgIT09IDApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbVNwYW4udGV4dENvbnRlbnQgPSBtc2c7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuc2V0KG1zZyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHRoZSBjdXJyZW50IG1hcnF1ZWUgYW5pbWF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnRpbWVyKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy88cmVmZXJlbmNlIHBhdGg9XCJ2aWV3QmFzZS50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbmNsYXNzIFNldHRpbmdzIGV4dGVuZHMgVmlld0Jhc2Vcclxue1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5SZXNldCAgICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTEJ1dHRvbkVsZW1lbnQ+ICgnI2J0blJlc2V0U2V0dGluZ3MnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuU2F2ZSAgICAgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5TYXZlU2V0dGluZ3MnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgY2hrVXNlVm94ICAgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNjaGtVc2VWb3gnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaGludFVzZVZveCAgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxFbGVtZW50PiAgICAgICAoJyNoaW50VXNlVm94Jyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFZveFZvaWNlICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94Vm9pY2UnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRWb3hQYXRoICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNpbnB1dFZveFBhdGgnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsVm94UmV2ZXJiICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxWb3hSZXZlcmInKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsVm94Q2hpbWUgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxWb3hDaGltZScpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxTcGVlY2hWb2ljZSAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFNwZWVjaENob2ljZScpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSByYW5nZVNwZWVjaFZvbCAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI3JhbmdlU3BlZWNoVm9sJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJhbmdlU3BlZWNoUGl0Y2ggPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjcmFuZ2VTcGVlY2hQaXRjaCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSByYW5nZVNwZWVjaFJhdGUgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI3JhbmdlU3BlZWNoUmF0ZScpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5TcGVlY2hUZXN0ICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTEJ1dHRvbkVsZW1lbnQ+ICgnI2J0blNwZWVjaFRlc3QnKTtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB0aW1lciBmb3IgdGhlIFwiUmVzZXRcIiBidXR0b24gY29uZmlybWF0aW9uIHN0ZXAgKi9cclxuICAgIHByaXZhdGUgcmVzZXRUaW1lb3V0PyA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCcjc2V0dGluZ3NTY3JlZW4nKTtcclxuICAgICAgICAvLyBUT0RPOiBDaGVjayBpZiBWT1ggaXMgYXZhaWxhYmxlLCBkaXNhYmxlIGlmIG5vdFxyXG5cclxuICAgICAgICB0aGlzLmJ0blJlc2V0Lm9uY2xpY2sgICAgICA9IHRoaXMuaGFuZGxlUmVzZXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgICAgICA9IHRoaXMuaGFuZGxlU2F2ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuY2hrVXNlVm94Lm9uY2hhbmdlICAgID0gdGhpcy5sYXlvdXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLnNlbFZveFZvaWNlLm9uY2hhbmdlICA9IHRoaXMubGF5b3V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0Lm9uY2xpY2sgPSB0aGlzLmhhbmRsZVZvaWNlVGVzdC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZSBsaXN0IG9mIGltcHVsc2UgcmVzcG9uc2UgZmlsZXNcclxuICAgICAgICBET00ucG9wdWxhdGUodGhpcy5zZWxWb3hSZXZlcmIsIFZveEVuZ2luZS5SRVZFUkJTLCBSQUcuY29uZmlnLnZveFJldmVyYik7XHJcblxyXG4gICAgICAgIC8vIFBvcHVsYXRlIHRoZSBsZWdhbCAmIGFja25vd2xlZGdlbWVudHMgYmxvY2tcclxuICAgICAgICBMaW5rZG93bi5sb2FkSW50bygnQUJPVVQubWQnLCAnI2Fib3V0QmxvY2snKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogT3BlbnMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIG9wZW4oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBUaGUgdm9pY2UgbGlzdCBoYXMgdG8gYmUgcG9wdWxhdGVkIGVhY2ggb3BlbiwgaW4gY2FzZSBpdCBjaGFuZ2VzXHJcbiAgICAgICAgdGhpcy5wb3B1bGF0ZVZvaWNlTGlzdCgpO1xyXG5cclxuICAgICAgICBpZiAoIVJBRy5zcGVlY2gudm94QXZhaWxhYmxlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gVE9ETyA6IExvY2FsaXplXHJcbiAgICAgICAgICAgIHRoaXMuY2hrVXNlVm94LmNoZWNrZWQgICAgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy5jaGtVc2VWb3guZGlzYWJsZWQgICA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuaGludFVzZVZveC5pbm5lckhUTUwgPSAnPHN0cm9uZz5WT1ggZW5naW5lPC9zdHJvbmc+IGlzIHVuYXZhaWxhYmxlLicgK1xyXG4gICAgICAgICAgICAgICAgJyBZb3VyIGJyb3dzZXIgb3IgZGV2aWNlIG1heSBub3QgYmUgc3VwcG9ydGVkOyBwbGVhc2UgY2hlY2sgdGhlIGNvbnNvbGUnICtcclxuICAgICAgICAgICAgICAgICcgZm9yIG1vcmUgaW5mb3JtYXRpb24uJztcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmNoa1VzZVZveC5jaGVja2VkID0gUkFHLmNvbmZpZy52b3hFbmFibGVkO1xyXG5cclxuICAgICAgICB0aGlzLnNlbFZveFZvaWNlLnZhbHVlICAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94UGF0aDtcclxuICAgICAgICB0aGlzLmlucHV0Vm94UGF0aC52YWx1ZSAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94Q3VzdG9tUGF0aDtcclxuICAgICAgICB0aGlzLnNlbFZveFJldmVyYi52YWx1ZSAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94UmV2ZXJiO1xyXG4gICAgICAgIHRoaXMuc2VsVm94Q2hpbWUudmFsdWUgICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hDaGltZTtcclxuICAgICAgICB0aGlzLnNlbFNwZWVjaFZvaWNlLnZhbHVlICAgICAgICAgICA9IFJBRy5jb25maWcuc3BlZWNoVm9pY2U7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyICAgPSBSQUcuY29uZmlnLnNwZWVjaFZvbDtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWVBc051bWJlciA9IFJBRy5jb25maWcuc3BlZWNoUGl0Y2g7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFJhdGUudmFsdWVBc051bWJlciAgPSBSQUcuY29uZmlnLnNwZWVjaFJhdGU7XHJcblxyXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuICAgICAgID0gZmFsc2U7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gICAgICAgPSB0cnVlO1xyXG4gICAgICAgIFJBRy52aWV3cy50b29sYmFyLmJ0bk9wdGlvbi5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxjdWxhdGVzIGZvcm0gbGF5b3V0IGFuZCBjb250cm9sIHZpc2liaWxpdHkgYmFzZWQgb24gc3RhdGUgKi9cclxuICAgIHByaXZhdGUgbGF5b3V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZveEVuYWJsZWQgPSB0aGlzLmNoa1VzZVZveC5jaGVja2VkO1xyXG4gICAgICAgIGxldCB2b3hDdXN0b20gID0gKHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgPT09ICcnKTtcclxuXHJcbiAgICAgICAgRE9NLnRvZ2dsZUhpZGRlbkFsbChcclxuICAgICAgICAgICAgW3RoaXMuc2VsU3BlZWNoVm9pY2UsICAgIXZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5yYW5nZVNwZWVjaFBpdGNoLCAhdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnNlbFZveFZvaWNlLCAgICAgICB2b3hFbmFibGVkXSxcclxuICAgICAgICAgICAgW3RoaXMuaW5wdXRWb3hQYXRoLCAgICAgIHZveEVuYWJsZWQgJiYgdm94Q3VzdG9tXSxcclxuICAgICAgICAgICAgW3RoaXMuc2VsVm94UmV2ZXJiLCAgICAgIHZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxWb3hDaGltZSwgICAgICAgdm94RW5hYmxlZF1cclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhcnMgYW5kIHBvcHVsYXRlcyB0aGUgdm9pY2UgbGlzdCAqL1xyXG4gICAgcHJpdmF0ZSBwb3B1bGF0ZVZvaWNlTGlzdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2UuaW5uZXJIVE1MID0gJyc7XHJcblxyXG4gICAgICAgIGxldCB2b2ljZXMgPSBSQUcuc3BlZWNoLmJyb3dzZXJWb2ljZXM7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBlbXB0eSBsaXN0XHJcbiAgICAgICAgaWYgKHZvaWNlcyA9PT0ge30pXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgb3B0aW9uICAgICAgPSBET00uYWRkT3B0aW9uKHRoaXMuc2VsU3BlZWNoVm9pY2UsIEwuU1RfU1BFRUNIX0VNUFRZKTtcclxuICAgICAgICAgICAgb3B0aW9uLmRpc2FibGVkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1NwZWVjaFN5bnRoZXNpc1xyXG4gICAgICAgIGVsc2UgZm9yIChsZXQgbmFtZSBpbiB2b2ljZXMpXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5zZWxTcGVlY2hWb2ljZSwgYCR7bmFtZX0gKCR7dm9pY2VzW25hbWVdLmxhbmd9KWAsIG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSByZXNldCBidXR0b24sIHdpdGggYSBjb25maXJtIHN0ZXAgdGhhdCBjYW5jZWxzIGFmdGVyIDE1IHNlY29uZHMgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlUmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMucmVzZXRUaW1lb3V0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5yZXNldFRpbWVvdXQgICAgICAgPSBzZXRUaW1lb3V0KHRoaXMuY2FuY2VsUmVzZXQuYmluZCh0aGlzKSwgMTUwMDApO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVRfQ09ORklSTTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX0NPTkZJUk1fVDtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgUkFHLmNvbmZpZy5yZXNldCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICB0aGlzLm9wZW4oKTtcclxuICAgICAgICBhbGVydChMLlNUX1JFU0VUX0RPTkUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYW5jZWwgdGhlIHJlc2V0IHRpbWVvdXQgYW5kIHJlc3RvcmUgdGhlIHJlc2V0IGJ1dHRvbiB0byBub3JtYWwgKi9cclxuICAgIHByaXZhdGUgY2FuY2VsUmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMucmVzZXRUaW1lb3V0KTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVQ7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX1Q7XHJcbiAgICAgICAgdGhpcy5yZXNldFRpbWVvdXQgICAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNhdmUgYnV0dG9uLCBzYXZpbmcgY29uZmlnIHRvIHN0b3JhZ2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU2F2ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5jb25maWcudm94RW5hYmxlZCAgICA9IHRoaXMuY2hrVXNlVm94LmNoZWNrZWQ7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hQYXRoICAgICAgID0gdGhpcy5zZWxWb3hWb2ljZS52YWx1ZTtcclxuICAgICAgICBSQUcuY29uZmlnLnZveEN1c3RvbVBhdGggPSB0aGlzLmlucHV0Vm94UGF0aC52YWx1ZTtcclxuICAgICAgICBSQUcuY29uZmlnLnZveFJldmVyYiAgICAgPSB0aGlzLnNlbFZveFJldmVyYi52YWx1ZTtcclxuICAgICAgICBSQUcuY29uZmlnLnZveENoaW1lICAgICAgPSB0aGlzLnNlbFZveENoaW1lLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoVm9pY2UgICA9IHRoaXMuc2VsU3BlZWNoVm9pY2UudmFsdWU7XHJcbiAgICAgICAgLy8gcGFyc2VGbG9hdCBpbnN0ZWFkIG9mIHZhbHVlQXNOdW1iZXI7IHNlZSBBcmNoaXRlY3R1cmUubWRcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFZvbCAgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2ggICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNhdmUoKTtcclxuICAgICAgICB0aGlzLmNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNwZWVjaCB0ZXN0IGJ1dHRvbiwgc3BlYWtpbmcgYSB0ZXN0IHBocmFzZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVWb2ljZVRlc3QoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgbGV0IHBocmFzZSAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJIVE1MID0gJzxwaHJhc2UgcmVmPVwic2FtcGxlXCIvPic7XHJcblxyXG4gICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHBocmFzZSk7XHJcblxyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKFxyXG4gICAgICAgICAgICAgICAgcGhyYXNlLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB1c2VWb3ggICAgOiB0aGlzLmNoa1VzZVZveC5jaGVja2VkLFxyXG4gICAgICAgICAgICAgICAgICAgIHZveFBhdGggICA6IHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgfHwgdGhpcy5pbnB1dFZveFBhdGgudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94UmV2ZXJiIDogdGhpcy5zZWxWb3hSZXZlcmIudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94Q2hpbWUgIDogdGhpcy5zZWxWb3hDaGltZS52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICB2b2ljZU5hbWUgOiB0aGlzLnNlbFNwZWVjaFZvaWNlLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHZvbHVtZSAgICA6IHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWVBc051bWJlcixcclxuICAgICAgICAgICAgICAgICAgICBwaXRjaCAgICAgOiB0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWVBc051bWJlcixcclxuICAgICAgICAgICAgICAgICAgICByYXRlICAgICAgOiB0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZUFzTnVtYmVyXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSwgMjAwKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cblxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInZpZXdCYXNlLnRzXCIvPlxuXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHN0YXRlIHNhdmUvbG9hZCBwaWNrZXIgZGlhbG9nICovXG5jbGFzcyBTdGF0ZVBpY2tlciBleHRlbmRzIFZpZXdCYXNlXG57XG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dE51bWJlciAgOiBIVE1MSW5wdXRFbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXROYW1lICAgIDogSFRNTElucHV0RWxlbWVudDtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVByZXZpZXcgICA6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgcFdhcm5pbmcgICAgIDogSFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5BY3Rpb24gICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkRlbGV0ZSAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQ2FuY2VsICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MaXN0ICAgICAgOiBIVE1MVUxpc3RFbGVtZW50O1xuXG4gICAgcHJpdmF0ZSBtb2RlOiAnc2F2ZScgfCAnbG9hZCcgPSAnc2F2ZSc7XG4gICAgcHJpdmF0ZSBzdGF0ZXM6IHsgW2tleTogbnVtYmVyXTogeyBuYW1lOiBzdHJpbmcsIGRhdGE6IHN0cmluZyB9IH0gPSB7fTtcblxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXG4gICAge1xuICAgICAgICBzdXBlcignI3N0YXRlUGlja2VyJyk7XG5cbiAgICAgICAgdGhpcy5pbnB1dE51bWJlciA9IHRoaXMuYXR0YWNoPEhUTUxJbnB1dEVsZW1lbnQ+KCcjc3RhdGVQaWNrZXJWYWx1ZScpO1xuICAgICAgICB0aGlzLmlucHV0TmFtZSAgID0gdGhpcy5hdHRhY2g8SFRNTElucHV0RWxlbWVudD4oJyNzdGF0ZVBpY2tlck5hbWUnKTtcbiAgICAgICAgdGhpcy5kb21QcmV2aWV3ICA9IHRoaXMuYXR0YWNoPEhUTUxFbGVtZW50PignI3N0YXRlUGlja2VyUHJldmlldycpO1xuICAgICAgICB0aGlzLnBXYXJuaW5nICAgID0gdGhpcy5hdHRhY2g8SFRNTEVsZW1lbnQ+KCcjc3RhdGVQaWNrZXJXYXJuaW5nJyk7XG4gICAgICAgIHRoaXMuYnRuQWN0aW9uICAgPSB0aGlzLmF0dGFjaDxIVE1MQnV0dG9uRWxlbWVudD4oJyNidG5TdGF0ZUFjdGlvbicpO1xuICAgICAgICB0aGlzLmJ0bkRlbGV0ZSAgID0gdGhpcy5hdHRhY2g8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcjYnRuU3RhdGVEZWxldGUnKTtcbiAgICAgICAgdGhpcy5idG5DYW5jZWwgICA9IHRoaXMuYXR0YWNoPEhUTUxCdXR0b25FbGVtZW50PignI2J0blN0YXRlQ2FuY2VsJyk7XG4gICAgICAgIHRoaXMuZG9tTGlzdCAgICAgPSB0aGlzLmF0dGFjaDxIVE1MVUxpc3RFbGVtZW50PignI3N0YXRlUGlja2VyTGlzdCcpO1xuXG4gICAgICAgIHRoaXMuYnRuQWN0aW9uLm9uY2xpY2sgPSB0aGlzLmhhbmRsZUFjdGlvbi5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmJ0bkRlbGV0ZS5vbmNsaWNrID0gdGhpcy5oYW5kbGVEZWxldGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5idG5DYW5jZWwub25jbGljayA9IHRoaXMuY2xvc2UuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5pbnB1dE51bWJlci5vbmlucHV0ID0gdGhpcy5oYW5kbGVJbnB1dC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmlucHV0TmFtZS5vbmlucHV0ID0gdGhpcy5oYW5kbGVOYW1lSW5wdXQuYmluZCh0aGlzKTtcbiAgICAgICAgXG4gICAgICAgIC8vIExvYWQgaW5pdGlhbCBzdGF0ZXMgZnJvbSBsb2NhbFN0b3JhZ2VcbiAgICAgICAgdGhpcy5sb2FkU3RhdGVzKCk7XG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgbG9hZFN0YXRlcygpOiB2b2lkIHtcbiAgICAgICAgbGV0IHJhdyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnc3RhdGVzJyk7XG4gICAgICAgIGlmIChyYXcpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgbGV0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlcyA9IHt9O1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGtleSBpbiBwYXJzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHZhbCA9IHBhcnNlZFtrZXldO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVzW3BhcnNlSW50KGtleSldID0geyBuYW1lOiBgU3RhdGUgJHtrZXl9YCwgZGF0YTogdmFsIH07XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlc1twYXJzZUludChrZXkpXSA9IHZhbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlcyA9IHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zdGF0ZXMgPSB7fTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIHNhdmVTdGF0ZXMoKTogdm9pZCB7XG4gICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnc3RhdGVzJywgSlNPTi5zdHJpbmdpZnkodGhpcy5zdGF0ZXMpKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3Blbihtb2RlOiAnc2F2ZScgfCAnbG9hZCcpIDogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5sb2FkU3RhdGVzKCk7XG4gICAgICAgIHRoaXMubW9kZSA9IG1vZGU7XG4gICAgICAgIHRoaXMuaW5wdXROdW1iZXIudmFsdWUgPSAnJztcbiAgICAgICAgdGhpcy5pbnB1dE5hbWUudmFsdWUgPSAnJztcbiAgICAgICAgdGhpcy5kb21QcmV2aWV3LmlubmVyVGV4dCA9ICcnO1xuICAgICAgICB0aGlzLnBXYXJuaW5nLmhpZGRlbiA9IHRydWU7XG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5tb2RlID09PSAnc2F2ZScpIHtcbiAgICAgICAgICAgIHRoaXMuYnRuQWN0aW9uLmlubmVyVGV4dCA9ICdTYXZlJztcbiAgICAgICAgICAgIHRoaXMuYnRuQWN0aW9uLmRpc2FibGVkID0gdHJ1ZTsgLy8gV2FpdCBmb3IgdmFsaWQgaW5wdXRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYnRuQWN0aW9uLmlubmVyVGV4dCA9ICdMb2FkJztcbiAgICAgICAgICAgIHRoaXMuYnRuQWN0aW9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYnRuRGVsZXRlLmhpZGRlbiA9IHRydWU7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmxheW91dCgpO1xuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSBmYWxzZTtcbiAgICAgICAgXG4gICAgICAgIC8vIFByZXZlbnQgaW50ZXJhY3Rpb24gd2l0aCByZXN0IG9mIFVJIHdoaWxlIG1vZGFsIGlzIG9wZW5cbiAgICAgICAgUkFHLnZpZXdzLm1haW4uc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcbiAgICAgICAgXG4gICAgICAgIHRoaXMucmVmcmVzaExpc3QoKTtcbiAgICAgICAgdGhpcy5pbnB1dE51bWJlci5mb2N1cygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVmcmVzaExpc3QoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZG9tTGlzdC5pbm5lckhUTUwgPSAnJztcbiAgICAgICAgbGV0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLnN0YXRlcykubWFwKGsgPT4gcGFyc2VJbnQoaykpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgbGV0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIGxpLmlubmVyVGV4dCA9ICdObyBzdGF0ZXMgc2F2ZWQgeWV0Lic7XG4gICAgICAgICAgICBsaS5zdHlsZS5wYWRkaW5nID0gJzVweCc7XG4gICAgICAgICAgICBsaS5zdHlsZS5jb2xvciA9ICcjODg4JztcbiAgICAgICAgICAgIHRoaXMuZG9tTGlzdC5hcHBlbmRDaGlsZChsaSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBrZXlzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGxldCBzdGF0ZU9iaiA9IHRoaXMuc3RhdGVzW2tleV07XG4gICAgICAgICAgICBsZXQgbmFtZSA9IHN0YXRlT2JqLm5hbWUgfHwgYFN0YXRlICR7a2V5fWA7XG4gICAgICAgICAgICBsZXQgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICAgICAgbGkuaW5uZXJUZXh0ID0gYCR7a2V5fTogJHtuYW1lfWA7XG4gICAgICAgICAgICBsaS5zdHlsZS5wYWRkaW5nID0gJzVweCc7XG4gICAgICAgICAgICBsaS5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG4gICAgICAgICAgICBsaS5zdHlsZS5ib3JkZXJCb3R0b20gPSAnMXB4IHNvbGlkICM0NDQnO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBsaS5vbm1vdXNlb3ZlciA9ICgpID0+IGxpLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICcjNDQ0JztcbiAgICAgICAgICAgIGxpLm9ubW91c2VvdXQgPSAoKSA9PiBsaS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAndHJhbnNwYXJlbnQnO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBsaS5vbmNsaWNrID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuaW5wdXROdW1iZXIudmFsdWUgPSBrZXkudG9TdHJpbmcoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUlucHV0KCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGhpcy5kb21MaXN0LmFwcGVuZENoaWxkKGxpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHVibGljIGNsb3NlKGV2PzogRXZlbnQpIDogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKGV2KSBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSB0cnVlO1xuICAgICAgICBSQUcudmlld3MubWFpbi5zdHlsZS5wb2ludGVyRXZlbnRzID0gJyc7XG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5tb2RlID09PSAnc2F2ZScpIHtcbiAgICAgICAgICAgIFJBRy52aWV3cy50b29sYmFyLmJ0blNhdmUuZm9jdXMoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFJBRy52aWV3cy50b29sYmFyLmJ0blJlY2FsbC5mb2N1cygpO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgbGF5b3V0KCkgOiB2b2lkIHtcbiAgICAgICAgbGV0IGRvY1cgICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoO1xuICAgICAgICBsZXQgZG9jSCAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0O1xuICAgICAgICBsZXQgZGlhbG9nWCAgICA9IERPTS5pc01vYmlsZSA/IDAgOiAoIChkb2NXICogMC4xKSAvIDIgKSB8IDA7XG4gICAgICAgIGxldCBkaWFsb2dZICAgID0gRE9NLmlzTW9iaWxlID8gMCA6ICggKGRvY0ggKiAwLjEpIC8gMiApIHwgMDtcbiAgICAgICAgXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpIHtcbiAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoID0gYDEwMCVgO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0aGlzLmRvbS5zdHlsZS5sZWZ0ID0gZGlhbG9nWCArICdweCc7XG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLnRvcCAgPSBkaWFsb2dZICsgJ3B4JztcbiAgICAgICAgdGhpcy5kb20uc3R5bGUuekluZGV4ID0gJzk5OTknO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlTmFtZUlucHV0KCk6IHZvaWQge1xuICAgICAgICAvLyBKdXN0IHRyaWdnZXIgaW5wdXQgaGFuZGxlciBpZiBpbiBzYXZlIG1vZGUsIGFzIG5hbWUgYWZmZWN0cyBub3RoaW5nIGluIGxvYWRcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZUlucHV0KCk6IHZvaWQge1xuICAgICAgICBsZXQgdmFsID0gcGFyc2VJbnQodGhpcy5pbnB1dE51bWJlci52YWx1ZSk7XG4gICAgICAgIGlmIChpc05hTih2YWwpIHx8IHZhbCA8IDEpIHtcbiAgICAgICAgICAgIHRoaXMuYnRuQWN0aW9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuYnRuRGVsZXRlLmhpZGRlbiA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnBXYXJuaW5nLmhpZGRlbiA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmRvbVByZXZpZXcuaW5uZXJUZXh0ID0gJyc7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGxldCBzdGF0ZU9iaiA9IHRoaXMuc3RhdGVzW3ZhbF07XG4gICAgICAgIGxldCBleGlzdHMgPSAoc3RhdGVPYmogIT09IHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuYnRuRGVsZXRlLmhpZGRlbiA9ICFleGlzdHM7XG4gICAgICAgIFxuICAgICAgICBpZiAoZXhpc3RzKSB7XG4gICAgICAgICAgICB0aGlzLmRvbVByZXZpZXcuaW5uZXJUZXh0ID0gdGhpcy5wcmV2aWV3U3RhdGVUZXh0KHN0YXRlT2JqLmRhdGEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5kb21QcmV2aWV3LmlubmVyVGV4dCA9ICcnO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5tb2RlID09PSAnc2F2ZScpIHtcbiAgICAgICAgICAgIHRoaXMuYnRuQWN0aW9uLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnBXYXJuaW5nLmhpZGRlbiA9ICFleGlzdHM7XG4gICAgICAgICAgICBpZiAoZXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wV2FybmluZy5pbm5lclRleHQgPSAnV2FybmluZzogU3RhdGUgYWxyZWFkeSBleGlzdHMgYW5kIHdpbGwgYmUgb3ZlcndyaXR0ZW4hJztcbiAgICAgICAgICAgICAgICB0aGlzLnBXYXJuaW5nLnN0eWxlLmNvbG9yID0gJyNmZmFhMDAnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTG9hZCBtb2RlXG4gICAgICAgICAgICB0aGlzLmJ0bkFjdGlvbi5kaXNhYmxlZCA9ICFleGlzdHM7XG4gICAgICAgICAgICB0aGlzLnBXYXJuaW5nLmhpZGRlbiA9IGV4aXN0czsgLy8gSWYgZG9lc24ndCBleGlzdCwgc2hvdyB3YXJuaW5nXG4gICAgICAgICAgICBpZiAoIWV4aXN0cykge1xuICAgICAgICAgICAgICAgIHRoaXMucFdhcm5pbmcuaW5uZXJUZXh0ID0gJ1N0YXRlIGRvZXMgbm90IGV4aXN0Lic7XG4gICAgICAgICAgICAgICAgdGhpcy5wV2FybmluZy5zdHlsZS5jb2xvciA9ICcjZmY1NTU1JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgcHJldmlld1N0YXRlVGV4dChzdGF0ZUpzb246IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgb2xkU3RhdGUgPSBSQUcuc3RhdGU7XG4gICAgICAgICAgICBSQUcuc3RhdGUgPSBPYmplY3QuYXNzaWduKG5ldyBTdGF0ZSgpLCBKU09OLnBhcnNlKHN0YXRlSnNvbikpIGFzIFN0YXRlO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBsZXQgdGVtcERvbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgdGVtcERvbS5pbm5lckhUTUwgPSAnPHBocmFzZXNldCByZWY9XCJyb290XCIgLz4nO1xuICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2Vzcyh0ZW1wRG9tKTtcbiAgICAgICAgICAgIGxldCBjb21waWxlZFRleHQgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHRlbXBEb20pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBSQUcuc3RhdGUgPSBvbGRTdGF0ZTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIGNvbXBpbGVkVGV4dDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIFwiRXJyb3IgY29tcGlsaW5nIHByZXZpZXc6IFwiICsgZS5tZXNzYWdlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoYW5kbGVBY3Rpb24oZXY6IEV2ZW50KTogdm9pZCB7XG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGxldCB2YWwgPSBwYXJzZUludCh0aGlzLmlucHV0TnVtYmVyLnZhbHVlKTtcbiAgICAgICAgaWYgKGlzTmFOKHZhbCkgfHwgdmFsIDwgMSkgcmV0dXJuO1xuICAgICAgICBcbiAgICAgICAgaWYgKHRoaXMubW9kZSA9PT0gJ3NhdmUnKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGxldCBuYW1lID0gdGhpcy5pbnB1dE5hbWUudmFsdWUudHJpbSgpIHx8IGBTdGF0ZSAke3ZhbH1gO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVzW3ZhbF0gPSB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IEpTT04uc3RyaW5naWZ5KFJBRy5zdGF0ZSlcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZVN0YXRlcygpO1xuICAgICAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChgU2F2ZWQgdG8gU3RhdGUgJHt2YWx9YCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9TQVZFX0ZBSUwoZS5tZXNzYWdlKSApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IHN0YXRlT2JqID0gdGhpcy5zdGF0ZXNbdmFsXTtcbiAgICAgICAgICAgIGlmIChzdGF0ZU9iaiAmJiBzdGF0ZU9iai5kYXRhKSB7XG4gICAgICAgICAgICAgICAgUkFHLmxvYWQoc3RhdGVPYmouZGF0YSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgaGFuZGxlRGVsZXRlKGV2OiBFdmVudCk6IHZvaWQge1xuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBsZXQgdmFsID0gcGFyc2VJbnQodGhpcy5pbnB1dE51bWJlci52YWx1ZSk7XG4gICAgICAgIGlmIChpc05hTih2YWwpIHx8IHZhbCA8IDEpIHJldHVybjtcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLnN0YXRlc1t2YWxdKSB7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5zdGF0ZXNbdmFsXTtcbiAgICAgICAgICAgIHRoaXMuc2F2ZVN0YXRlcygpO1xuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KGBEZWxldGVkIFN0YXRlICR7dmFsfWApO1xuICAgICAgICAgICAgdGhpcy5pbnB1dE51bWJlci52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgdGhpcy5yZWZyZXNoTGlzdCgpO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVJbnB1dCgpO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xuXG4vKipcbiAqIENvbnRyb2xsZXIgZm9yIHRoZSB0b3AgdG9vbGJhci5cbiAqXG4gKiBUaGUgdG9vbGJhciBkaWZmZXJzIHBlciBwYWdlOiB0aGUgZWRpdG9yIHBhZ2UgKGluZGV4Lmh0bWwpIGhhcyBubyBydW4gYnV0dG9uXG4gKiBiZWNhdXNlIHBsYXliYWNrIGlzIGNvbnRyb2xsZWQgZnJvbSB0aGUgZGFzaGJvYXJkOyB0aGUgZGFzaGJvYXJkIHBhZ2VcbiAqIChkYXNoYm9hcmQuaHRtbCkgcnVucyBzY2VuYXJpb3MgZnJvbSBpdHMgb3duIHBhbmVsLiBCdXR0b25zIHRoYXQgYXJlIG5vdFxuICogcHJlc2VudCBvbiBhIGdpdmVuIHBhZ2UgYXJlIGxvb2tlZCB1cCBvcHRpb25hbGx5IGFuZCBzaW1wbHkgbm90IHdpcmVkLlxuICovXG5jbGFzcyBUb29sYmFyXG57XG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gICAgICAgICA6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUGxheSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5TdG9wICAgICA6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkdlbmVyYXRlIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHVibGljICByZWFkb25seSBidG5TYXZlICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHB1YmxpYyAgcmVhZG9ubHkgYnRuUmVjYWxsICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGJ0bk9wdGlvbiAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5EYXNoYm9hcmQgOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5TY2VuYXJpbyAgOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blVwZGF0ZVN0ZXAgOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG5cbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxuICAgIHtcbiAgICAgICAgdGhpcy5kb20gICAgICAgICA9IERPTS5yZXF1aXJlKCcjdG9vbGJhcicpO1xuICAgICAgICB0aGlzLmJ0blBsYXkgICAgID0gVG9vbGJhci5vcHRpb25hbCgnI2J0blBsYXknKTtcbiAgICAgICAgdGhpcy5idG5TdG9wICAgICA9IFRvb2xiYXIub3B0aW9uYWwoJyNidG5TdG9wJyk7XG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUgPSBET00ucmVxdWlyZSgnI2J0blNodWZmbGUnKTtcbiAgICAgICAgdGhpcy5idG5TYXZlICAgICA9IERPTS5yZXF1aXJlKCcjYnRuU2F2ZScpO1xuICAgICAgICB0aGlzLmJ0blJlY2FsbCAgID0gRE9NLnJlcXVpcmUoJyNidG5Mb2FkJyk7XG4gICAgICAgIHRoaXMuYnRuT3B0aW9uICAgPSBET00ucmVxdWlyZSgnI2J0blNldHRpbmdzJyk7XG4gICAgICAgIHRoaXMuYnRuRGFzaGJvYXJkID0gVG9vbGJhci5vcHRpb25hbCgnI2J0bkRhc2hib2FyZCcpO1xuICAgICAgICB0aGlzLmJ0blNjZW5hcmlvICA9IERPTS5yZXF1aXJlKCcjYnRuU2NlbmFyaW8nKTtcbiAgICAgICAgdGhpcy5idG5VcGRhdGVTdGVwID0gVG9vbGJhci5vcHRpb25hbCgnI2J0blVwZGF0ZVN0ZXAnKTtcblxuICAgICAgICBpZiAodGhpcy5idG5QbGF5KSB0aGlzLmJ0blBsYXkub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVBsYXkuYmluZCh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMuYnRuU3RvcCkgdGhpcy5idG5TdG9wLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTdG9wLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUub25jbGljayA9IHRoaXMuaGFuZGxlR2VuZXJhdGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTYXZlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnRuUmVjYWxsLm9uY2xpY2sgICA9IHRoaXMuaGFuZGxlTG9hZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmJ0bk9wdGlvbi5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZU9wdGlvbi5iaW5kKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy5idG5EYXNoYm9hcmQpIHRoaXMuYnRuRGFzaGJvYXJkLm9uY2xpY2sgPSAoKSA9PiB3aW5kb3cub3BlbignaW5kZXguaHRtbD9kYXNoYm9hcmQ9MScsICdfYmxhbmsnKTtcbiAgICAgICAgdGhpcy5idG5TY2VuYXJpby5vbmNsaWNrID0gdGhpcy5oYW5kbGVDYXB0dXJlU3RlcC5iaW5kKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy5idG5VcGRhdGVTdGVwKSB0aGlzLmJ0blVwZGF0ZVN0ZXAub25jbGljayA9IHRoaXMuaGFuZGxlVXBkYXRlU3RlcC5iaW5kKHRoaXMpO1xuXG4gICAgICAgIGlmICghUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LmFkZCgndGhyb2InKTtcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuZm9jdXMoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLmJ0blBsYXkpXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKiogTG9va3MgdXAgYSB0b29sYmFyIGJ1dHRvbiB0aGF0IGlzIGxlZ2l0aW1hdGVseSBhYnNlbnQgb24gc29tZSBwYWdlcyAqL1xuICAgIHByaXZhdGUgc3RhdGljIG9wdGlvbmFsKHNlbDogc3RyaW5nKSA6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbFxuICAgIHtcbiAgICAgICAgcmV0dXJuIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsKSB8fCBudWxsO1xuICAgIH1cblxuICAgIC8qKiBQbGF5cyB0aGUgY3VycmVudCBhbm5vdW5jZW1lbnQgdGhyb3VnaCB0aGUgc3BlZWNoIGVuZ2luZSAqL1xuICAgIHByaXZhdGUgaGFuZGxlUGxheSgpIDogdm9pZFxuICAgIHtcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XG4gICAgICAgIGlmICh0aGlzLmJ0blBsYXkpIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHRoaXMuaGFuZGxlUGxheTIuYmluZCh0aGlzKSwgMjAwKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZVBsYXkyKCkgOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgaGFzU3Bva2VuICAgPSBmYWxzZTtcbiAgICAgICAgbGV0IHNwZWVjaFRleHQgID0gUkFHLnZpZXdzLmVkaXRvci5nZXRUZXh0KCk7XG4gICAgICAgIGlmICh0aGlzLmJ0blBsYXkpIHsgdGhpcy5idG5QbGF5LmhpZGRlbiA9IHRydWU7IHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IGZhbHNlOyB9XG4gICAgICAgIGlmICh0aGlzLmJ0blN0b3ApICB0aGlzLmJ0blN0b3AuaGlkZGVuID0gZmFsc2U7XG5cbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdMb2FkaW5nIFZPWC4uLicsIGZhbHNlKTtcblxuICAgICAgICBsZXQgdGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xuICAgICAgICB9LCAxMCAqIDEwMDApO1xuXG4gICAgICAgIFJBRy5zcGVlY2gub25zcGVhayA9ICgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChzcGVlY2hUZXh0KTtcbiAgICAgICAgICAgIGhhc1Nwb2tlbiAgICAgICAgICA9IHRydWU7XG4gICAgICAgICAgICBSQUcuc3BlZWNoLm9uc3BlYWsgPSB1bmRlZmluZWQ7XG4gICAgICAgIH07XG5cbiAgICAgICAgUkFHLnNwZWVjaC5vbnN0b3AgPSAoKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZVN0b3AoKTtcbiAgICAgICAgICAgIGlmICghaGFzU3Bva2VuICYmIFJBRy5jb25maWcudm94RW5hYmxlZClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBSQUcuY29uZmlnLnZveEVuYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBhbGVydCgnSXQgYXBwZWFycyB0aGF0IHRoZSBWT1ggZW5naW5lIHdhcyB1bmFibGUgdG8gc2F5IGFueXRoaW5nLiBUaGUgVk9YIGVuZ2luZSBoYXMgYmVlbiBkaXNhYmxlZCBhbmQgbmF0aXZlIHRleHQtdG8tc3BlZWNoIHdpbGwgYmUgdXNlZCBvbiBuZXh0IHBsYXkuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICghaGFzU3Bva2VuKVxuICAgICAgICAgICAgICAgIGFsZXJ0KCdJdCBhcHBlYXJzIHRoYXQgdGhlIGJyb3dzZXIgd2FzIHVuYWJsZSB0byBzYXkgYW55dGhpbmcuIFBsZWFzZSBjaGVjayB0aGUgY29uc29sZS4nKTtcbiAgICAgICAgICAgIGlmICghaGFzU3Bva2VuKVxuICAgICAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChzcGVlY2hUZXh0KTtcbiAgICAgICAgfTtcblxuICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKFJBRy52aWV3cy5lZGl0b3IuZ2V0UGhyYXNlKCkpO1xuICAgICAgICBpZiAodGhpcy5idG5TdG9wKSB0aGlzLmJ0blN0b3AuZm9jdXMoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZVN0b3AoZXY/OiBFdmVudCkgOiB2b2lkXG4gICAge1xuICAgICAgICBSQUcuc3BlZWNoLm9uc3BlYWsgID0gdW5kZWZpbmVkO1xuICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCAgID0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAodGhpcy5idG5QbGF5KSB0aGlzLmJ0blBsYXkuaGlkZGVuID0gZmFsc2U7XG4gICAgICAgIGlmICh0aGlzLmJ0blN0b3AgJiYgdGhpcy5idG5QbGF5ICYmIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMuYnRuU3RvcClcbiAgICAgICAgICAgIHRoaXMuYnRuUGxheS5mb2N1cygpO1xuICAgICAgICBpZiAodGhpcy5idG5TdG9wKSB0aGlzLmJ0blN0b3AuaGlkZGVuID0gdHJ1ZTtcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XG4gICAgICAgIGlmIChldilcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKSwgZmFsc2UpO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlR2VuZXJhdGUoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LnJlbW92ZSgndGhyb2InKTtcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XG4gICAgICAgIFJBRy5jb25maWcuY2xpY2tlZEdlbmVyYXRlID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWQgeyBSQUcudmlld3Muc3RhdGVQaWNrZXIub3Blbignc2F2ZScpOyB9XG4gICAgcHJpdmF0ZSBoYW5kbGVMb2FkKCkgOiB2b2lkIHsgUkFHLnZpZXdzLnN0YXRlUGlja2VyLm9wZW4oJ2xvYWQnKTsgfVxuICAgIHByaXZhdGUgaGFuZGxlT3B0aW9uKCkgOiB2b2lkIHsgUkFHLnZpZXdzLnNldHRpbmdzLm9wZW4oKTsgfVxuXG4gICAgLyoqXG4gICAgICogQ2FwdHVyZXMgdGhlIGN1cnJlbnQgYW5ub3VuY2VtZW50IGFzIGEgbmV3IHN0ZXAgaW4gdGhlIGFjdGl2ZSBzY2VuYXJpby5cbiAgICAgKiBUaGUgYWN0aXZlIHNjZW5hcmlvIGxpdmVzIGluIGxvY2FsU3RvcmFnZSAoc2hhcmVkIHdpdGggdGhlIGRhc2hib2FyZCk7XG4gICAgICogaWYgbm9uZSBpcyBhY3RpdmUgeWV0LCBhIGZyZXNoIG9uZSBpcyBjcmVhdGVkIGFuZCBtYWRlIGFjdGl2ZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGhhbmRsZUNhcHR1cmVTdGVwKCkgOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgcmF3ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3JhZy5zY2VuYXJpb3MnKTtcbiAgICAgICAgbGV0IHNjZW5hcmlvcyA6IGFueVtdID0gcmF3ID8gKEpTT04ucGFyc2UocmF3KSBhcyBhbnlbXSkgOiBbXTtcbiAgICAgICAgbGV0IGlkID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3JhZy5jdXJyZW50U2NlbmFyaW9JZCcpO1xuICAgICAgICBsZXQgc2MgPSBzY2VuYXJpb3MuZmluZCgoczogYW55KSA9PiBzLmlkID09PSBpZCk7XG5cbiAgICAgICAgaWYgKCFzYylcbiAgICAgICAge1xuICAgICAgICAgICAgaWQgPSAnc2NuXycgKyBEYXRlLm5vdygpO1xuICAgICAgICAgICAgc2MgPSB7IGlkOiBpZCwgbmFtZTogJ1NjZW5hcmlvICcgKyAoc2NlbmFyaW9zLmxlbmd0aCArIDEpLCBzdGVwczogW10sIGxvb3BDb3VudDogMSwgY3JlYXRlZEF0OiBEYXRlLm5vdygpLCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfTtcbiAgICAgICAgICAgIHNjZW5hcmlvcy5wdXNoKHNjKTtcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcuY3VycmVudFNjZW5hcmlvSWQnLCBpZCk7XG4gICAgICAgIH1cblxuICAgICAgICBzYy5zdGVwcy5wdXNoKHsgdHlwZTogJ2Fubm91bmNlbWVudCcsIHN0YXRlSnNvbjogSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKSwgZ2FwTXM6IDE1MDAgfSk7XG4gICAgICAgIHNjLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcuc2NlbmFyaW9zJywgSlNPTi5zdHJpbmdpZnkoc2NlbmFyaW9zKSk7XG4gICAgICAgIGlmIChSQUcuZGFzaGJvYXJkKVxuICAgICAgICAgICAgUkFHLmRhc2hib2FyZC5yZWZyZXNoKCk7XG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCgnQ2FwdHVyZWQgc3RlcCAnICsgc2Muc3RlcHMubGVuZ3RoICsgJyBpbnRvIFwiJyArIHNjLm5hbWUgKyAnXCInKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXcml0ZXMgdGhlIGN1cnJlbnQgYW5ub3VuY2VtZW50IGJhY2sgaW50byB0aGUgc2VsZWN0ZWQgc2NlbmFyaW8gc3RlcFxuICAgICAqICh0aGUgb25lIG9wZW5lZCBmb3IgZWRpdGluZyBmcm9tIHRoZSBkYXNoYm9hcmQpLlxuICAgICAqL1xuICAgIHByaXZhdGUgaGFuZGxlVXBkYXRlU3RlcCgpIDogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IGlkID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3JhZy5jdXJyZW50U2NlbmFyaW9JZCcpO1xuICAgICAgICBsZXQgaWR4U3RyID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3JhZy5zZWxlY3RlZFN0ZXBJbmRleCcpO1xuICAgICAgICBpZiAoIWlkIHx8IGlkeFN0ciA9PT0gbnVsbCkgeyBhbGVydCgnTm8gc2NlbmFyaW8vc3RlcCBzZWxlY3RlZC4gT3BlbiB0aGUgZGFzaGJvYXJkIGFuZCBjbGljayBhIHN0ZXAgZmlyc3QuJyk7IHJldHVybjsgfVxuXG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludChpZHhTdHIpO1xuICAgICAgICBsZXQgcmF3ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3JhZy5zY2VuYXJpb3MnKTtcbiAgICAgICAgaWYgKCFyYXcpIHsgYWxlcnQoJ05vIHNjZW5hcmlvcyBzYXZlZCB5ZXQuJyk7IHJldHVybjsgfVxuXG4gICAgICAgIGxldCBzY2VuYXJpb3MgPSBKU09OLnBhcnNlKHJhdykgYXMgYW55W107XG4gICAgICAgIGxldCBzYyA9IHNjZW5hcmlvcy5maW5kKChzOiBhbnkpID0+IHMuaWQgPT09IGlkKTtcbiAgICAgICAgaWYgKCFzYyB8fCAhc2Muc3RlcHNbaWR4XSkgeyBhbGVydCgnU3RlcCBub3QgZm91bmQuJyk7IHJldHVybjsgfVxuXG4gICAgICAgIHNjLnN0ZXBzW2lkeF0uc3RhdGVKc29uID0gSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKTtcbiAgICAgICAgc2MudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3JhZy5zY2VuYXJpb3MnLCBKU09OLnN0cmluZ2lmeShzY2VuYXJpb3MpKTtcbiAgICAgICAgaWYgKFJBRy5kYXNoYm9hcmQpXG4gICAgICAgICAgICBSQUcuZGFzaGJvYXJkLnJlZnJlc2goKTtcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdVcGRhdGVkIHN0ZXAgJyArIChpZHggKyAxKSArICcgaW4gXCInICsgc2MubmFtZSArICdcIicpO1xuICAgIH1cbn1cbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIFVJIGVsZW1lbnRzIGFuZCB0aGVpciBsb2dpYyAqL1xyXG5jbGFzcyBWaWV3c1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHNjcmVlbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBtYWluICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIGRpc2NsYWltZXIgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGRpc2NsYWltZXIgOiBEaXNjbGFpbWVyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBlZGl0b3IgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGVkaXRvciAgICAgOiBFZGl0b3I7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIG1hcnF1ZWUgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG1hcnF1ZWUgICAgOiBNYXJxdWVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc2V0dGluZ3MgICA6IFNldHRpbmdzO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3RhdGUgcGlja2VyIHNjcmVlbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzdGF0ZVBpY2tlcjogU3RhdGVQaWNrZXI7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHRvb2xiYXIgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHRvb2xiYXIgICAgOiBUb29sYmFyO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gYWxsIHRoZSBwaWNrZXJzLCBvbmUgZm9yIGVhY2ggdHlwZSBvZiBYTUwgZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBwaWNrZXJzICAgIDogRGljdGlvbmFyeTxQaWNrZXI+O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5tYWluICAgICAgID0gRE9NLnJlcXVpcmUoJyNtYWluU2NyZWVuJyk7XHJcbiAgICAgICAgdGhpcy5kaXNjbGFpbWVyID0gbmV3IERpc2NsYWltZXIoKTtcclxuICAgICAgICB0aGlzLmVkaXRvciAgICAgPSBuZXcgRWRpdG9yKCk7XHJcbiAgICAgICAgdGhpcy5tYXJxdWVlICAgID0gbmV3IE1hcnF1ZWUoKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzICAgPSBuZXcgU2V0dGluZ3MoKTtcclxuICAgICAgICB0aGlzLnN0YXRlUGlja2VyID0gbmV3IFN0YXRlUGlja2VyKCk7XHJcbiAgICAgICAgdGhpcy50b29sYmFyICAgID0gbmV3IFRvb2xiYXIoKTtcclxuICAgICAgICB0aGlzLnBpY2tlcnMgICAgPSB7fTtcclxuXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgICBuZXcgQ29hY2hQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEV4Y3VzZVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgSW50ZWdlclBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgTmFtZWRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBocmFzZXNldFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgUGxhdGZvcm1QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFNlcnZpY2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25MaXN0UGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBUaW1lUGlja2VyKClcclxuICAgICAgICBdLmZvckVhY2gocGlja2VyID0+IHRoaXMucGlja2Vyc1twaWNrZXIueG1sVGFnXSA9IHBpY2tlcik7XHJcblxyXG4gICAgICAgIC8vIEdsb2JhbCBob3RrZXlzXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaU9TLXNwZWNpZmljIENTUyBmaXhlc1xyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnaW9zJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIHBpY2tlciB0aGF0IGhhbmRsZXMgYSBnaXZlbiB0YWcsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGdldFBpY2tlcih4bWxUYWc6IHN0cmluZykgOiBQaWNrZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waWNrZXJzW3htbFRhZ107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZSBFU0MgdG8gY2xvc2UgcGlja2VycyBvciBzZXR0aWducyAqL1xyXG4gICAgcHJpdmF0ZSBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoZXYua2V5ICE9PSAnRXNjYXBlJylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuY2xvc2UoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vIEdsb2JhbCBtZXRob2RzIGZvciBhc3NlcnRpbmcgdGhlIGV4aXN0ZW5jZSBvZiB2YWx1ZXMuIFRvIGtlZXAgdGhlIGNoYW5jZSBvZiBlcnJvcnNcclxuLy8gd2l0aGluIGFzc2VydHMgbG93LCBubyBsb2NhbGl6YXRpb24gaXMgdXNlZCBoZXJlLlxyXG5cclxuLyoqIEFzc2VydHMgdGhhdCB0aGUgZ2l2ZW4gdmFsdWUgZXhpc3RzOyBuZWl0aGVyIHVuZGVmaW5lZCBub3IgbnVsbCAqL1xyXG5mdW5jdGlvbiBhc3NlcnQ8VD4odmFsdWU6IFQpIDogVFxyXG57XHJcbiAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbClcclxuICAgICAgICB0aHJvdyBBc3NlcnRFcnJvcignVmFsdWUgZG9lcyBub3QgZXhpc3QnLCBhc3NlcnQpO1xyXG5cclxuICAgIHJldHVybiB2YWx1ZTtcclxufVxyXG5cclxuLyoqIEFzc2VydHMgdGhhdCB0aGUgZ2l2ZW4gdmFsdWUgZXhpc3RzIGFuZCBpcyBhIG51bWJlciAqL1xyXG5mdW5jdGlvbiBhc3NlcnROdW1iZXIodmFsdWU6IG51bWJlcikgOiB2b2lkXHJcbntcclxuICAgIGlmICggdHlwZW9mIHZhbHVlICE9PSAnbnVtYmVyJyB8fCBpc05hTih2YWx1ZSkgKVxyXG4gICAgICAgIHRocm93IEFzc2VydEVycm9yKCdWYWx1ZSBpcyBub3QgYSBudW1iZXInLCBhc3NlcnROdW1iZXIpO1xyXG59XHJcblxyXG4vKiogQ3JlYXRlcyBhbiBhc3NlcnRpb24gZXJyb3IgdGhhdCBiZWdpbnMgdGhlIHN0YWNrIGF0IHRoZSBhc3NlcnQncyBjYWxsIHNpdGUgICovXHJcbmZ1bmN0aW9uIEFzc2VydEVycm9yKG1lc3NhZ2U6IGFueSwgY2FsbGVyOiBGdW5jdGlvbikgOiBFcnJvclxyXG57XHJcbiAgICBsZXQgZXJyb3IgPSBFcnJvcihgQXNzZXJ0aW9uIGZhaWxlZDogJHttZXNzYWdlfWApO1xyXG5cclxuICAgIGlmIChFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSlcclxuICAgICAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZShlcnJvciwgY2FsbGVyKTtcclxuXHJcbiAgICByZXR1cm4gZXJyb3I7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggY29sbGFwc2libGUgZWxlbWVudHMgKi9cclxuY2xhc3MgQ29sbGFwc2libGVzXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzcGFuIFRoZSBlbmNhcHN1bGF0aW5nIGNvbGxhcHNpYmxlIGVsZW1lbnRcclxuICAgICAqIEBwYXJhbSBzdGF0ZSBUcnVlIHRvIGNvbGxhcHNlLCBmYWxzZSB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2V0KHNwYW46IEhUTUxFbGVtZW50LCBzdGF0ZTogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHN0YXRlKSBzcGFuLnNldEF0dHJpYnV0ZSgnY29sbGFwc2VkJywgJycpO1xyXG4gICAgICAgIGVsc2UgICAgICAgc3Bhbi5yZW1vdmVBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN1Z2FyIGZvciBjaG9vc2luZyBzZWNvbmQgdmFsdWUgaWYgZmlyc3QgaXMgdW5kZWZpbmVkLCBpbnN0ZWFkIG9mIGZhbHN5ICovXHJcbmZ1bmN0aW9uIGVpdGhlcjxUPih2YWx1ZTogVCB8IHVuZGVmaW5lZCwgdmFsdWUyOiBUKSA6IFRcclxue1xyXG4gICAgcmV0dXJuICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSA/IHZhbHVlMiA6IHZhbHVlO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHRoZSBET00gKi9cclxuY2xhc3MgRE9NXHJcbntcclxuICAgIC8qKiBXaGV0aGVyIHRoZSB3aW5kb3cgaXMgdGhpbm5lciB0aGFuIGEgc3BlY2lmaWMgc2l6ZSAoYW5kLCB0aHVzLCBpcyBcIm1vYmlsZVwiKSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaXNNb2JpbGUoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aCA8PSA1MDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgUkFHIGFwcGVhcnMgdG8gYmUgcnVubmluZyBvbiBhbiBpT1MgZGV2aWNlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc2lPUygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3IucGxhdGZvcm0ubWF0Y2goL2lQaG9uZXxpUG9kfGlQYWQvZ2kpICE9PSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBhdHRyaWJ1dGUgZnJvbSB0aGUgZ2l2ZW4gZWxlbWVudCwgb3IgcmV0dXJucyB0aGUgZ2l2ZW5cclxuICAgICAqIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEBwYXJhbSBkZWYgRGVmYXVsdCB2YWx1ZSBpZiBhdHRyaWJ1dGUgaXNuJ3Qgc2V0XHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gYXR0cmlidXRlJ3MgdmFsdWUsIG9yIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcsIGRlZjogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKVxyXG4gICAgICAgICAgICA/IGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpIVxyXG4gICAgICAgICAgICA6IGRlZjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFuIGVsZW1lbnQgZnJvbSB0aGUgZ2l2ZW4gZG9jdW1lbnQsIHRocm93aW5nIGFuIGVycm9yIGlmIG5vIG1hdGNoIGlzIGZvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBxdWVyeSBDU1Mgc2VsZWN0b3IgcXVlcnkgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50IFBhcmVudCBvYmplY3QgdG8gc2VhcmNoOyBkZWZhdWx0cyB0byBkb2N1bWVudFxyXG4gICAgICogQHJldHVybnMgVGhlIGZpcnN0IGVsZW1lbnQgdG8gbWF0Y2ggdGhlIGdpdmVuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZTxUIGV4dGVuZHMgSFRNTEVsZW1lbnQ+XHJcbiAgICAgICAgKHF1ZXJ5OiBzdHJpbmcsIHBhcmVudDogUGFyZW50Tm9kZSA9IHdpbmRvdy5kb2N1bWVudCkgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKHF1ZXJ5KSBhcyBUO1xyXG5cclxuICAgICAgICBpZiAoIXJlc3VsdClcclxuICAgICAgICAgICAgdGhyb3cgQXNzZXJ0RXJyb3IoTC5ET01fTUlTU0lORyhxdWVyeSksIERPTS5yZXF1aXJlKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gYXR0cmlidXRlIGZyb20gdGhlIGdpdmVuIGVsZW1lbnQsIHRocm93aW5nIGFuIGVycm9yXHJcbiAgICAgKiBpZiB0aGUgYXR0cmlidXRlIGlzIG1pc3NpbmcuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmVBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cikgKVxyXG4gICAgICAgICAgICB0aHJvdyBBc3NlcnRFcnJvcihMLkFUVFJfTUlTU0lORyhhdHRyKSwgRE9NLnJlcXVpcmVBdHRyKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpITtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4ga2V5IG9mIHRoZSBnaXZlbiBlbGVtZW50J3MgZGF0YXNldCwgdGhyb3dpbmcgYW4gZXJyb3JcclxuICAgICAqIGlmIHRoZSB2YWx1ZSBpcyBtaXNzaW5nIG9yIGVtcHR5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBkYXRhIG9mXHJcbiAgICAgKiBAcGFyYW0ga2V5IEtleSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gZGF0YXNldCdzIHZhbHVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZURhdGEoZWxlbWVudDogSFRNTEVsZW1lbnQsIGtleTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IGVsZW1lbnQuZGF0YXNldFtrZXldO1xyXG5cclxuICAgICAgICBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eSh2YWx1ZSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBBc3NlcnRFcnJvcihMLkRBVEFfTUlTU0lORyhrZXkpLCBET00ucmVxdWlyZURhdGEpO1xyXG5cclxuICAgICAgICByZXR1cm4gdmFsdWUhO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQmx1cnMgKHVuZm9jdXNlcykgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBhcmVudCBJZiBnaXZlbiwgb25seSBibHVycyBpZiBhY3RpdmUgaXMgZGVzY2VuZGFudFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJsdXJBY3RpdmUocGFyZW50OiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmJvZHkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhY3RpdmUgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIGFjdGl2ZSAmJiBhY3RpdmUuYmx1ciAmJiBwYXJlbnQuY29udGFpbnMoYWN0aXZlKSApXHJcbiAgICAgICAgICAgIGFjdGl2ZS5ibHVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZWVwIGNsb25lcyBhbGwgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBpbnRvIHRoZSB0YXJnZXQgZWxlbWVudC5cclxuICAgICAqIFVzaW5nIGlubmVySFRNTCB3b3VsZCBiZSBlYXNpZXIsIGhvd2V2ZXIgaXQgaGFuZGxlcyBzZWxmLWNsb3NpbmcgdGFncyBwb29ybHkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNvdXJjZSBFbGVtZW50IHdob3NlIGNoaWxkcmVuIHRvIGNsb25lXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gYXBwZW5kIHRoZSBjbG9uZWQgY2hpbGRyZW4gdG9cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbG9uZUludG8oc291cmNlOiBIVE1MRWxlbWVudCwgdGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3VyY2UuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGFyZ2V0LmFwcGVuZENoaWxkKCBzb3VyY2UuY2hpbGROb2Rlc1tpXS5jbG9uZU5vZGUodHJ1ZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1Z2FyIGZvciBjcmVhdGluZyBhbmQgYWRkaW5nIGFuIG9wdGlvbiBlbGVtZW50IHRvIGEgc2VsZWN0IGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBTZWxlY3QgbGlzdCBlbGVtZW50IHRvIGFkZCB0aGUgb3B0aW9uIHRvXHJcbiAgICAgKiBAcGFyYW0gdGV4dCBMYWJlbCBmb3IgdGhlIG9wdGlvblxyXG4gICAgICogQHBhcmFtIHZhbHVlIFZhbHVlIGZvciB0aGUgb3B0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYWRkT3B0aW9uKHNlbGVjdDogSFRNTFNlbGVjdEVsZW1lbnQsIHRleHQ6IHN0cmluZywgdmFsdWU6IHN0cmluZyA9ICcnKVxyXG4gICAgICAgIDogSFRNTE9wdGlvbkVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICBsZXQgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJykgYXMgSFRNTE9wdGlvbkVsZW1lbnQ7XHJcblxyXG4gICAgICAgIG9wdGlvbi50ZXh0ICA9IHRleHQ7XHJcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gdmFsdWU7XHJcblxyXG4gICAgICAgIHNlbGVjdC5hZGQob3B0aW9uKTtcclxuICAgICAgICByZXR1cm4gb3B0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3VnYXIgZm9yIHBvcHVsYXRpbmcgYSBzZWxlY3QgZWxlbWVudCB3aXRoIGl0ZW1zIGZyb20gYSBnaXZlbiBvYmplY3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGxpc3QgU2VsZWN0IGVsZW1lbnQgdG8gcG9wdWxhdGVcclxuICAgICAqIEBwYXJhbSBpdGVtcyBBIGRpY3Rpb25hcnkgd2hlcmUga2V5cyBhY3QgbGlrZSB2YWx1ZXMsIGFuZCB2YWx1ZXMgbGlrZSBsYWJlbHNcclxuICAgICAqIEBwYXJhbSBzZWxlY3RlZCBJZiBtYXRjaGVzIGEgZGljdGlvbmFyeSBrZXksIHRoYXQga2V5IGlzIHRoZSBwcmUtc2VsZWN0ZWQgb3B0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcG9wdWxhdGUobGlzdDogSFRNTFNlbGVjdEVsZW1lbnQsIGl0ZW1zOiBhbnksIHNlbGVjdGVkPzogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCB2YWx1ZSBpbiBpdGVtcylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsYWJlbCA9IGl0ZW1zW3ZhbHVlXTtcclxuICAgICAgICAgICAgbGV0IG9wdCAgID0gRE9NLmFkZE9wdGlvbihsaXN0LCBsYWJlbCwgdmFsdWUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgPT09IHNlbGVjdGVkKVxyXG4gICAgICAgICAgICAgICAgb3B0LnNlbGVjdGVkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4uXHJcbiAgICAgKiBCZSB3YXJuZWQ7IHRoaXMgbWV0aG9kIHVzZXMgUkFHLXNwZWNpZmljIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgVGV4dCBjb250ZW50IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICAgICAgKGVsZW1lbnQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICBlbHNlIGlmICggZWxlbWVudC50YWdOYW1lID09PSAnQlVUVE9OJyApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgLy8gUmV0dXJuIGJsYW5rIChza2lwKSBpZiBjaGlsZCBvZiBhIGNvbGxhcHNlZCBlbGVtZW50LiBQcmV2aW91c2x5LCB0aGlzIHVzZWRcclxuICAgICAgICAvLyBnZXRDb21wdXRlZFN0eWxlLCBidXQgdGhhdCBkb2Vzbid0IHdvcmsgaWYgdGhlIGVsZW1lbnQgaXMgcGFydCBvZiBhbiBvcnBoYW5lZFxyXG4gICAgICAgIC8vIHBocmFzZSAoYXMgaGFwcGVucyB3aXRoIHRoZSBwaHJhc2VzZXQgcGlja2VyKS5cclxuICAgICAgICBsZXQgcGFyZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIHBhcmVudCAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgbGV0IHRleHQgPSAnJztcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGV4dCArPSBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudC5jaGlsZE5vZGVzW2ldIGFzIEVsZW1lbnQpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHRleHQgY29udGVudCBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgZXhjbHVkaW5nIHRoZSB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlbixcclxuICAgICAqIGFuZCBleGNlc3Mgd2hpdGVzcGFjZSBhcyBhIHJlc3VsdCBvZiBjb252ZXJ0aW5nIGZyb20gSFRNTC9YTUwuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgQ2xlYW5lZCB0ZXh0IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRDbGVhbmVkVmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gU3RyaW5ncy5jbGVhbiggRE9NLmdldFZpc2libGVUZXh0KGVsZW1lbnQpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTY2FucyBmb3IgdGhlIG5leHQgZm9jdXNhYmxlIHNpYmxpbmcgZnJvbSBhIGdpdmVuIGVsZW1lbnQsIHNraXBwaW5nIGhpZGRlbiBvclxyXG4gICAgICogdW5mb2N1c2FibGUgZWxlbWVudHMuIElmIHRoZSBlbmQgb2YgdGhlIGNvbnRhaW5lciBpcyBoaXQsIHRoZSBzY2FuIHdyYXBzIGFyb3VuZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZnJvbSBFbGVtZW50IHRvIHN0YXJ0IHNjYW5uaW5nIGZyb21cclxuICAgICAqIEBwYXJhbSBkaXIgRGlyZWN0aW9uOyAtMSBmb3IgbGVmdCAocHJldmlvdXMpLCAxIGZvciByaWdodCAobmV4dClcclxuICAgICAqIEByZXR1cm5zIFRoZSBuZXh0IGF2YWlsYWJsZSBzaWJsaW5nLCBvciBudWxsIGlmIG5vbmUgZm91bmRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXROZXh0Rm9jdXNhYmxlU2libGluZyhmcm9tOiBIVE1MRWxlbWVudCwgZGlyOiBudW1iZXIpXHJcbiAgICAgICAgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBpZiAoZGlyID09PSAwKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5CQURfRElSRUNUSU9OKGRpcikgKTtcclxuXHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSBmcm9tO1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gZnJvbS5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIXBhcmVudClcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIHdoaWxlICh0cnVlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gUHJvY2VlZCB0byBuZXh0IGVsZW1lbnQsIG9yIHdyYXAgYXJvdW5kIGlmIGhpdCB0aGUgZW5kIG9mIHBhcmVudFxyXG4gICAgICAgICAgICBpZiAgICAgIChkaXIgPCAwKVxyXG4gICAgICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQucHJldmlvdXNFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHBhcmVudC5sYXN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPiAwKVxyXG4gICAgICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgcGFyZW50LmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgd2UndmUgY29tZSBiYWNrIHRvIHRoZSBzdGFydGluZyBlbGVtZW50LCBub3RoaW5nIHdhcyBmb3VuZFxyXG4gICAgICAgICAgICBpZiAoY3VycmVudCA9PT0gZnJvbSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGhpcyBlbGVtZW50IGlzbid0IGhpZGRlbiBhbmQgaXMgZm9jdXNhYmxlLCByZXR1cm4gaXQhXHJcbiAgICAgICAgICAgIGlmICggIWN1cnJlbnQuaGlkZGVuIClcclxuICAgICAgICAgICAgaWYgKCBjdXJyZW50Lmhhc0F0dHJpYnV0ZSgndGFiaW5kZXgnKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY3VycmVudDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBpbmRleCBvZiBhIGNoaWxkIGVsZW1lbnQsIHJlbGV2YW50IHRvIGl0cyBwYXJlbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvOTEzMjU3NS8zMzU0OTIwXHJcbiAgICAgKiBAcGFyYW0gY2hpbGQgQ2hpbGQgZWxlbWVudCB0byBnZXQgdGhlIGluZGV4IG9mXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW5kZXhPZihjaGlsZDogSFRNTEVsZW1lbnQpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCA9IGNoaWxkLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJlbnRcclxuICAgICAgICAgICAgPyBBcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKHBhcmVudC5jaGlsZHJlbiwgY2hpbGQpXHJcbiAgICAgICAgICAgIDogLTE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBpbmRleCBvZiBhIGNoaWxkIG5vZGUsIHJlbGV2YW50IHRvIGl0cyBwYXJlbnQuIFVzZWQgZm9yIHRleHQgbm9kZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvOTEzMjU3NS8zMzU0OTIwXHJcbiAgICAgKiBAcGFyYW0gY2hpbGQgQ2hpbGQgbm9kZSB0byBnZXQgdGhlIGluZGV4IG9mXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbm9kZUluZGV4T2YoY2hpbGQ6IE5vZGUpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCA9IGNoaWxkLnBhcmVudE5vZGU7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJlbnRcclxuICAgICAgICAgICAgPyBBcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKHBhcmVudC5jaGlsZE5vZGVzLCBjaGlsZClcclxuICAgICAgICAgICAgOiAtMTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRvZ2dsZXMgdGhlIGhpZGRlbiBhdHRyaWJ1dGUgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGFuZCBhbGwgaXRzIGxhYmVscy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHRvZ2dsZSB0aGUgaGlkZGVuIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGZvcmNlIE9wdGlvbmFsIHZhbHVlIHRvIGZvcmNlIHRvZ2dsaW5nIHRvXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdG9nZ2xlSGlkZGVuKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBmb3JjZT86IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBoaWRkZW4gPSAhZWxlbWVudC5oaWRkZW47XHJcblxyXG4gICAgICAgIC8vIERvIG5vdGhpbmcgaWYgYWxyZWFkeSB0b2dnbGVkIHRvIHRoZSBmb3JjZWQgc3RhdGVcclxuICAgICAgICBpZiAoaGlkZGVuID09PSBmb3JjZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbGVtZW50LmhpZGRlbiA9IGhpZGRlbjtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2Zvcj0nJHtlbGVtZW50LmlkfSddYClcclxuICAgICAgICAgICAgLmZvckVhY2gobCA9PiAobCBhcyBIVE1MRWxlbWVudCkuaGlkZGVuID0gaGlkZGVuKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRvZ2dsZXMgdGhlIGhpZGRlbiBhdHRyaWJ1dGUgb2YgYSBncm91cCBvZiBlbGVtZW50cywgaW4gYnVsay5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbGlzdCBBbiBhcnJheSBvZiBhcmd1bWVudCBwYWlycyBmb3Ige3RvZ2dsZUhpZGRlbn1cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0b2dnbGVIaWRkZW5BbGwoLi4ubGlzdDogW0hUTUxFbGVtZW50LCBib29sZWFuP11bXSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGlzdC5mb3JFYWNoKCBsID0+IHRoaXMudG9nZ2xlSGlkZGVuKC4uLmwpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQSB2ZXJ5IHNtYWxsIHN1YnNldCBvZiBNYXJrZG93biBmb3IgaHlwZXJsaW5raW5nIGEgYmxvY2sgb2YgdGV4dCAqL1xyXG5jbGFzcyBMaW5rZG93blxyXG57XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGlua2VkIHRleHQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX0xJTksgPSAvXFxbKFtcXHNcXFNdKz8pXFxdXFxbKFxcZCspXFxdL2dtaTtcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rIHJlZmVyZW5jZXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX1JFRiAgPSAvXlxcWyhcXGQrKVxcXTpcXHMrKFxcUyspJC9nbWk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRlbXB0cyB0byBsb2FkIHRoZSBnaXZlbiBsaW5rZG93biBmaWxlLCBwYXJzZSBhbmQgc2V0IGl0IGFzIGFuIGVsZW1lbnQncyB0ZXh0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwYXRoIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCB0byBmZXRjaCB0aGUgbGlua2Rvd24gZnJvbVxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IERPTSBxdWVyeSBmb3IgdGhlIG9iamVjdCB0byBwdXQgdGhlIHRleHQgaW50b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWRJbnRvKHBhdGg6IHN0cmluZywgcXVlcnk6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGRvbSA9IERPTS5yZXF1aXJlKHF1ZXJ5KTtcclxuXHJcbiAgICAgICAgZG9tLmlubmVyVGV4dCA9IGBMb2FkaW5nIHRleHQgZnJvbSAnJHtwYXRofScuLi5gO1xyXG5cclxuICAgICAgICBmZXRjaChwYXRoKVxyXG4gICAgICAgICAgICAudGhlbiggcmVxID0+IHJlcS50ZXh0KCkgKVxyXG4gICAgICAgICAgICAudGhlbiggdHh0ID0+IGRvbS5pbm5lckhUTUwgPSBMaW5rZG93bi5wYXJzZSh0eHQpIClcclxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiBkb20uaW5uZXJUZXh0ID0gYENvdWxkIG5vdCBsb2FkICcke3BhdGh9JzogJHtlcnJ9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQYXJzZXMgdGhlIGdpdmVuIHRleHQgZnJvbSBMaW5rZG93biB0byBIVE1MLCBjb252ZXJ0aW5nIHRhZ2dlZCB0ZXh0IGludG8gbGlua3NcclxuICAgICAqIHVzaW5nIGEgZ2l2ZW4gbGlzdCBvZiByZWZlcmVuY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0ZXh0IExpbmtkb3duIHRleHQgdG8gdHJhbnNmb3JtIHRvIEhUTUxcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcGFyc2UodGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBsaW5rcyA6IERpY3Rpb25hcnk8c3RyaW5nPiA9IHt9O1xyXG5cclxuICAgICAgICAvLyBGaXJzdCwgc2FuaXRpemUgYW55IEhUTUxcclxuICAgICAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKCc8JywgJyZsdDsnKS5yZXBsYWNlKCc+JywgJyZndDsnKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZ2V0IHRoZSBsaXN0IG9mIHJlZmVyZW5jZXMsIHJlbW92aW5nIHRoZW0gZnJvbSB0aGUgdGV4dFxyXG4gICAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9SRUYsIChfLCBrLCB2KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGlua3Nba10gPSB2O1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmFsbHksIHJlcGxhY2UgZWFjaCB0YWdnZWQgcGFydCBvZiB0ZXh0IHdpdGggYSBsaW5rIGVsZW1lbnQuIElmIGEgdGFnIGhhc1xyXG4gICAgICAgIC8vIGFuIGludmFsaWQgcmVmZXJlbmNlLCBpdCBpcyBpZ25vcmVkLlxyXG4gICAgICAgIHJldHVybiB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9MSU5LLCAobWF0Y2gsIHQsIGspID0+XHJcbiAgICAgICAgICAgIGxpbmtzW2tdXHJcbiAgICAgICAgICAgICAgICA/IGA8YSBocmVmPScke2xpbmtzW2tdfScgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXJcIj4ke3R9PC9hPmBcclxuICAgICAgICAgICAgICAgIDogbWF0Y2hcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgcGFyc2luZyBkYXRhIGZyb20gc3RyaW5ncyAqL1xyXG5jbGFzcyBQYXJzZVxyXG57XHJcbiAgICAvKiogUGFyc2VzIGEgZ2l2ZW4gc3RyaW5nIGludG8gYSBib29sZWFuICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJvb2xlYW4oc3RyOiBzdHJpbmcpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHN0ciA9IHN0ci50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgICAgICBpZiAoc3RyID09PSAndHJ1ZScgIHx8IHN0ciA9PT0gJzEnKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBpZiAoc3RyID09PSAnZmFsc2UnIHx8IHN0ciA9PT0gJzAnKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9CT09MRUFOKHN0cikgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGdlbmVyYXRpbmcgcmFuZG9tIGRhdGEgKi9cclxuY2xhc3MgUmFuZG9tXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gaW50ZWdlciBmcm9tIHRoZSBnaXZlbiByYW5nZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gaW50ZWdlciB0byBwaWNrLCBpbmNsdXNpdmVcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHJldHVybnMgUmFuZG9tIGludGVnZXIgd2l0aGluIHRoZSBnaXZlbiByYW5nZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludChtaW46IG51bWJlciA9IDAsIG1heDogbnVtYmVyID0gMSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5yb3VuZCggTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICkgKyBtaW47XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5LWxpa2Ugb2JqZWN0IHdpdGggYSBsZW5ndGggcHJvcGVydHkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXJyYXkoYXJyOiBMZW5ndGhhYmxlKSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBhcnJbIFJhbmRvbS5pbnQoMCwgYXJyLmxlbmd0aCAtIDEpIF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNwbGljZXMgYSByYW5kb20gZWxlbWVudCBmcm9tIGEgZ2l2ZW4gYXJyYXkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXJyYXlTcGxpY2U8VD4oYXJyOiBUW10pIDogVFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBhcnIuc3BsaWNlKFJhbmRvbS5pbnQoMCwgYXJyLmxlbmd0aCAtIDEpLCAxKVswXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20ga2V5IGZyb20gYSBnaXZlbiBvYmplY3QgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgb2JqZWN0S2V5KG9iajoge30pIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSggT2JqZWN0LmtleXMob2JqKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgdHJ1ZSBvciBmYWxzZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBvdXQgb2YgMTAwLCB0byBwaWNrIGB0cnVlYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJvb2woY2hhbmNlOiBudW1iZXIgPSA1MCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5pbnQoMCwgMTAwKSA8IGNoYW5jZTtcclxuICAgIH1cclxufVxyXG4iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBjbGFzcyBmb3IgYXVkaW8gZnVuY3Rpb25hbGl0eSAqL1xyXG5jbGFzcyBTb3VuZHNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBEZWNvZGVzIHRoZSBnaXZlbiBhdWRpbyBmaWxlIGludG8gcmF3IGF1ZGlvIGRhdGEuIFRoaXMgaXMgYSB3cmFwcGVyIGZvciB0aGUgb2xkZXJcclxuICAgICAqIGNhbGxiYWNrLWJhc2VkIHN5bnRheCwgc2luY2UgaXQgaXMgdGhlIG9ubHkgb25lIGlPUyBjdXJyZW50bHkgc3VwcG9ydHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nXHJcbiAgICAgKiBAcGFyYW0gYnVmZmVyIEJ1ZmZlciBvZiBlbmNvZGVkIGZpbGUgZGF0YSAoZS5nLiBtcDMpIHRvIGRlY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFzeW5jIGRlY29kZShjb250ZXh0OiBBdWRpb0NvbnRleHQsIGJ1ZmZlcjogQXJyYXlCdWZmZXIpXHJcbiAgICAgICAgOiBQcm9taXNlPEF1ZGlvQnVmZmVyPlxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSA8QXVkaW9CdWZmZXI+ICggKHJlc29sdmUsIHJlamVjdCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBjb250ZXh0LmRlY29kZUF1ZGlvRGF0YShidWZmZXIsIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggc3RyaW5ncyAqL1xyXG5jbGFzcyBTdHJpbmdzXHJcbntcclxuICAgIC8qKiBDaGVja3MgaWYgdGhlIGdpdmVuIHN0cmluZyBpcyBudWxsLCBvciBlbXB0eSAod2hpdGVzcGFjZSBvbmx5IG9yIHplcm8tbGVuZ3RoKSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpc051bGxPckVtcHR5KHN0cjogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuICFzdHIgfHwgIXN0ci50cmltKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQcmV0dHktcHJpbnQncyBhIGdpdmVuIGxpc3Qgb2Ygc3RhdGlvbnMsIHdpdGggY29udGV4dCBzZW5zaXRpdmUgZXh0cmFzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlcyBMaXN0IG9mIHN0YXRpb24gY29kZXMgdG8gam9pblxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgTGlzdCdzIGNvbnRleHQuIElmICdjYWxsaW5nJywgaGFuZGxlcyBzcGVjaWFsIGNhc2VcclxuICAgICAqIEByZXR1cm5zIFByZXR0eS1wcmludGVkIGxpc3Qgb2YgZ2l2ZW4gc3RhdGlvbnNcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tU3RhdGlvbkxpc3QoY29kZXM6IHN0cmluZ1tdLCBjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9ICcnO1xyXG4gICAgICAgIGxldCBuYW1lcyAgPSBjb2Rlcy5zbGljZSgpO1xyXG5cclxuICAgICAgICBuYW1lcy5mb3JFYWNoKCAoYywgaSkgPT4gbmFtZXNbaV0gPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjKSApO1xyXG5cclxuICAgICAgICBpZiAobmFtZXMubGVuZ3RoID09PSAxKVxyXG4gICAgICAgICAgICByZXN1bHQgPSAoY29udGV4dCA9PT0gJ2NhbGxpbmcnKVxyXG4gICAgICAgICAgICAgICAgPyBgJHtuYW1lc1swXX0gb25seWBcclxuICAgICAgICAgICAgICAgIDogbmFtZXNbMF07XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxhc3RTdGF0aW9uID0gbmFtZXMucG9wKCk7XHJcblxyXG4gICAgICAgICAgICByZXN1bHQgID0gbmFtZXMuam9pbignLCAnKTtcclxuICAgICAgICAgICAgcmVzdWx0ICs9IGAgYW5kICR7bGFzdFN0YXRpb259YDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQcmV0dHktcHJpbnRzIHRoZSBnaXZlbiBkYXRlIG9yIGhvdXJzIGFuZCBtaW51dGVzIGludG8gYSAyNC1ob3VyIHRpbWUgKGUuZy4gMDE6MDkpLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBob3VycyBIb3VycywgZnJvbSAwIHRvIDIzLCBvciBEYXRlIG9iamVjdFxyXG4gICAgICogQHBhcmFtIG1pbnV0ZXMgTWludXRlcywgZnJvbSAwIHRvIDU5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVRpbWUoaG91cnM6IG51bWJlciB8IERhdGUsIG1pbnV0ZXM6IG51bWJlciA9IDApIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGhvdXJzIGluc3RhbmNlb2YgRGF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG1pbnV0ZXMgPSBob3Vycy5nZXRNaW51dGVzKCk7XHJcbiAgICAgICAgICAgIGhvdXJzICAgPSBob3Vycy5nZXRIb3VycygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGhvdXJzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKSArICc6JyArXHJcbiAgICAgICAgICAgIG1pbnV0ZXMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhbnMgdXAgdGhlIGdpdmVuIHRleHQgb2YgZXhjZXNzIHdoaXRlc3BhY2UgYW5kIGFueSBuZXdsaW5lcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbGVhbih0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHQudHJpbSgpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFxuXFxyXS9naSwgICAnJyAgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzezIsfS9naSwgICAnICcgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgv4oCcXFxzKy9naSwgICAgICfigJwnIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyvigJ0vZ2ksICAgICAn4oCdJyApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMoWy4sXSkvZ2ksICckMScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdHJvbmdseSBjb21wcmVzc2VzIHRoZSBnaXZlbiBzdHJpbmcgdG8gb25lIG1vcmUgZmlsZW5hbWUgZnJpZW5kbHkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZmlsZW5hbWUodGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0ZXh0XHJcbiAgICAgICAgICAgIC50b0xvd2VyQ2FzZSgpXHJcbiAgICAgICAgICAgIC8vIFJlcGxhY2UgcGx1cmFsc1xyXG4gICAgICAgICAgICAucmVwbGFjZSgvaWVzXFxiL2csICd5JylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGNvbW1vbiB3b3Jkc1xyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxiKGF8YW58YXR8YmV8b2Z8b258dGhlfHRvfGlufGlzfGhhc3xieXx3aXRoKVxcYi9nLCAnJylcclxuICAgICAgICAgICAgLnRyaW0oKVxyXG4gICAgICAgICAgICAvLyBDb252ZXJ0IHNwYWNlcyB0byB1bmRlcnNjb3Jlc1xyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzKy9nLCAnXycpXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBhbGwgbm9uLWFscGhhbnVtZXJpY2Fsc1xyXG4gICAgICAgICAgICAucmVwbGFjZSgvW15hLXowLTlfXS9nLCAnJylcclxuICAgICAgICAgICAgLy8gTGltaXQgdG8gMTAwIGNoYXJzOyBtb3N0IHN5c3RlbXMgc3VwcG9ydCBtYXguIDI1NSBieXRlcyBpbiBmaWxlbmFtZXNcclxuICAgICAgICAgICAgLnN1YnN0cmluZygwLCAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBmaXJzdCBtYXRjaCBvZiBhIHBhdHRlcm4gaW4gYSBzdHJpbmcsIG9yIHVuZGVmaW5lZCBpZiBub3QgZm91bmQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZmlyc3RNYXRjaCh0ZXh0OiBzdHJpbmcsIHBhdHRlcm46IFJlZ0V4cCwgaWR4OiBudW1iZXIpXHJcbiAgICAgICAgOiBzdHJpbmcgfCB1bmRlZmluZWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbWF0Y2ggPSB0ZXh0Lm1hdGNoKHBhdHRlcm4pO1xyXG5cclxuICAgICAgICByZXR1cm4gKG1hdGNoICYmIG1hdGNoW2lkeF0pXHJcbiAgICAgICAgICAgID8gbWF0Y2hbaWR4XVxyXG4gICAgICAgICAgICA6IHVuZGVmaW5lZDtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVbmlvbiB0eXBlIGZvciBpdGVyYWJsZSB0eXBlcyB3aXRoIGEgLmxlbmd0aCBwcm9wZXJ0eSAqL1xyXG50eXBlIExlbmd0aGFibGUgPSBBcnJheTxhbnk+IHwgTm9kZUxpc3QgfCBIVE1MQ29sbGVjdGlvbiB8IHN0cmluZztcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgcGxhdGZvcm0gYXMgYSBkaWdpdCBhbmQgb3B0aW9uYWwgbGV0dGVyIHR1cGxlICovXHJcbnR5cGUgUGxhdGZvcm0gPSBbc3RyaW5nLCBzdHJpbmddO1xyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBzdGF0aW9uIG5hbWUsIHdoaWNoIGNhbiBiZSBhIHNpbXBsZSBzdHJpbmcgb3IgY29tcGxleCBvYmplY3QgKi9cclxudHlwZSBTdGF0aW9uID0gc3RyaW5nIHwgU3RhdGlvbkRlZjtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgY29tcGxleCBzdGF0aW9uIG5hbWUgZGVmaW5pdGlvbiAqL1xyXG5pbnRlcmZhY2UgU3RhdGlvbkRlZlxyXG57XHJcbiAgICAvKiogQ2Fub25pY2FsIG5hbWUgb2YgdGhlIHN0YXRpb24gKi9cclxuICAgIG5hbWUgICAgICA6IHN0cmluZztcclxuICAgIC8qKiBTdGF0aW9uIGNvZGUgdG8gdXNlIHRoZSBzYW1lIHJlY29yZGluZyBvZiAqL1xyXG4gICAgdm94QWxpYXM/IDogc3RyaW5nO1xyXG59XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIGdlbmVyaWMga2V5LXZhbHVlIGRpY3Rpb25hcnksIHdpdGggc3RyaW5nIGtleXMgKi9cclxudHlwZSBEaWN0aW9uYXJ5PFQ+ID0geyBbaW5kZXg6IHN0cmluZ106IFQgfTtcclxuXHJcbi8qKiBEZWZpbmVzIHRoZSBkYXRhIHJlZmVyZW5jZXMgY29uZmlnIG9iamVjdCBwYXNzZWQgaW50byBSQUcubWFpbiBvbiBpbml0ICovXHJcbmludGVyZmFjZSBEYXRhUmVmc1xyXG57XHJcbiAgICAvKiogU2VsZWN0b3IgZm9yIGdldHRpbmcgdGhlIHBocmFzZSBzZXQgWE1MIElGcmFtZSBlbGVtZW50ICovXHJcbiAgICBwaHJhc2VzZXRFbWJlZCA6IHN0cmluZztcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgZXhjdXNlcyBmb3IgdHJhaW4gZGVsYXlzIG9yIGNhbmNlbGxhdGlvbnMgdG8gdXNlICovXHJcbiAgICBleGN1c2VzRGF0YSAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBuYW1lcyBmb3Igc3BlY2lhbCB0cmFpbnMgdG8gdXNlICovXHJcbiAgICBuYW1lZERhdGEgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBuYW1lcyBmb3Igc2VydmljZXMvbmV0d29ya3MgdG8gdXNlICovXHJcbiAgICBzZXJ2aWNlc0RhdGEgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIFJhdyBkaWN0aW9uYXJ5IG9mIHN0YXRpb24gY29kZXMgYW5kIG5hbWVzIHRvIHVzZSAqL1xyXG4gICAgc3RhdGlvbnNEYXRhICAgOiBEaWN0aW9uYXJ5PHN0cmluZz47XHJcbn1cclxuXHJcbi8qKiBGaWxsIGlucyBmb3IgdmFyaW91cyBtaXNzaW5nIGRlZmluaXRpb25zIG9mIG1vZGVybiBKYXZhc2NyaXB0IGZlYXR1cmVzICovXHJcblxyXG5pbnRlcmZhY2UgV2luZG93XHJcbntcclxuICAgIG9udW5oYW5kbGVkcmVqZWN0aW9uOiBFcnJvckV2ZW50SGFuZGxlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFycmF5PFQ+XHJcbntcclxuICAgIGluY2x1ZGVzKHNlYXJjaEVsZW1lbnQ6IFQsIGZyb21JbmRleD86IG51bWJlcikgOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRXJyb3JDb25zdHJ1Y3RvclxyXG57XHJcbiAgICBjYXB0dXJlU3RhY2tUcmFjZSh0YXJnZXQ6IGFueSwgY3Rvcj86IEZ1bmN0aW9uKSA6IHZvaWQ7XHJcbn1cclxuXHJcbmludGVyZmFjZSBIVE1MRWxlbWVudFxyXG57XHJcbiAgICBsYWJlbHMgOiBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFN0cmluZ1xyXG57XHJcbiAgICBwYWRTdGFydCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxuICAgIHBhZEVuZCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEF1ZGlvQ29udGV4dEJhc2Vcclxue1xyXG4gICAgYXVkaW9Xb3JrbGV0IDogQXVkaW9Xb3JrbGV0O1xyXG59XHJcblxyXG50eXBlIFNhbXBsZUNoYW5uZWxzID0gRmxvYXQzMkFycmF5W11bXTtcclxuXHJcbmRlY2xhcmUgY2xhc3MgQXVkaW9Xb3JrbGV0UHJvY2Vzc29yXHJcbntcclxuICAgIHN0YXRpYyBwYXJhbWV0ZXJEZXNjcmlwdG9ycyA6IEF1ZGlvUGFyYW1EZXNjcmlwdG9yW107XHJcblxyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKG9wdGlvbnM/OiBBdWRpb1dvcmtsZXROb2RlT3B0aW9ucyk7XHJcbiAgICByZWFkb25seSBwb3J0PzogTWVzc2FnZVBvcnQ7XHJcblxyXG4gICAgcHJvY2VzcyhcclxuICAgICAgICBpbnB1dHM6IFNhbXBsZUNoYW5uZWxzLFxyXG4gICAgICAgIG91dHB1dHM6IFNhbXBsZUNoYW5uZWxzLFxyXG4gICAgICAgIHBhcmFtZXRlcnM6IERpY3Rpb25hcnk8RmxvYXQzMkFycmF5PlxyXG4gICAgKSA6IGJvb2xlYW47XHJcbn1cclxuXHJcbmludGVyZmFjZSBBdWRpb1dvcmtsZXROb2RlT3B0aW9ucyBleHRlbmRzIEF1ZGlvTm9kZU9wdGlvbnNcclxue1xyXG4gICAgbnVtYmVyT2ZJbnB1dHM/IDogbnVtYmVyO1xyXG4gICAgbnVtYmVyT2ZPdXRwdXRzPyA6IG51bWJlcjtcclxuICAgIG91dHB1dENoYW5uZWxDb3VudD8gOiBudW1iZXJbXTtcclxuICAgIHBhcmFtZXRlckRhdGE/IDoge1tpbmRleDogc3RyaW5nXSA6IG51bWJlcn07XHJcbiAgICBwcm9jZXNzb3JPcHRpb25zPyA6IGFueTtcclxufVxyXG5cclxuaW50ZXJmYWNlIE1lZGlhVHJhY2tDb25zdHJhaW50U2V0XHJcbntcclxuICAgIGF1dG9HYWluQ29udHJvbD86IGJvb2xlYW4gfCBDb25zdHJhaW5Cb29sZWFuUGFyYW1ldGVycztcclxuICAgIG5vaXNlU3VwcHJlc3Npb24/OiBib29sZWFuIHwgQ29uc3RyYWluQm9vbGVhblBhcmFtZXRlcnM7XHJcbn1cclxuXHJcbmRlY2xhcmUgZnVuY3Rpb24gcmVnaXN0ZXJQcm9jZXNzb3IobmFtZTogc3RyaW5nLCBjdG9yOiBBdWRpb1dvcmtsZXRQcm9jZXNzb3IpIDogdm9pZDsiLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ3Jvc3Mtd2luZG93IGNvbW11bmljYXRpb24gY2hhbm5lbCB1c2luZyBCcm9hZGNhc3RDaGFubmVsICovXHJcbmNsYXNzIFNjZW5hcmlvQ2hhbm5lbFxyXG57XHJcbiAgICBwcml2YXRlIGNoYW5uZWw6IEJyb2FkY2FzdENoYW5uZWwgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgbGlzdGVuZXJzOiB7IFt0eXBlOiBzdHJpbmddOiBBcnJheTwoZGF0YTogYW55KSA9PiB2b2lkPiB9ID0ge307XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBpZiAodHlwZW9mIEJyb2FkY2FzdENoYW5uZWwgIT09ICd1bmRlZmluZWQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdHJ5XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hhbm5lbCA9IG5ldyBCcm9hZGNhc3RDaGFubmVsKCdyYWdfc2NlbmFyaW9fY2hhbm5lbCcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGFubmVsLm9ubWVzc2FnZSA9IChldmVudDogTWVzc2FnZUV2ZW50KSA9PlxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBtc2cgPSBldmVudC5kYXRhO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cgJiYgbXNnLnR5cGUpXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgaGFuZGxlcnMgPSB0aGlzLmxpc3RlbmVyc1ttc2cudHlwZV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoYW5kbGVycylcclxuICAgICAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlcnMuZm9yRWFjaChoID0+IGgobXNnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0Jyb2FkY2FzdENoYW5uZWwgbm90IHN1cHBvcnRlZCBvciBmYWlsZWQ6JywgZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIG9uKHR5cGU6IHN0cmluZywgaGFuZGxlcjogKGRhdGE6IGFueSkgPT4gdm9pZCk6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMubGlzdGVuZXJzW3R5cGVdKVxyXG4gICAgICAgICAgICB0aGlzLmxpc3RlbmVyc1t0eXBlXSA9IFtdO1xyXG5cclxuICAgICAgICB0aGlzLmxpc3RlbmVyc1t0eXBlXS5wdXNoKGhhbmRsZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBvZmYodHlwZTogc3RyaW5nLCBoYW5kbGVyOiAoZGF0YTogYW55KSA9PiB2b2lkKTogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBoYW5kbGVycyA9IHRoaXMubGlzdGVuZXJzW3R5cGVdO1xyXG4gICAgICAgIGlmICghaGFuZGxlcnMpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGkgPSBoYW5kbGVycy5pbmRleE9mKGhhbmRsZXIpO1xyXG4gICAgICAgIGlmIChpICE9PSAtMSlcclxuICAgICAgICAgICAgaGFuZGxlcnMuc3BsaWNlKGksIDEpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzZW5kKHR5cGU6IHN0cmluZywgcGF5bG9hZDogYW55ID0ge30pOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY2hhbm5lbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRyeVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5uZWwucG9zdE1lc3NhZ2UoT2JqZWN0LmFzc2lnbih7IHR5cGU6IHR5cGUgfSwgcGF5bG9hZCkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBzZW5kIEJyb2FkY2FzdENoYW5uZWwgbWVzc2FnZTonLCBlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuKHdpbmRvdyBhcyBhbnkpLlNjZW5hcmlvQ2hhbm5lbCA9IFNjZW5hcmlvQ2hhbm5lbDtcclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgZGF0YSBmb3IgZXhjdXNlcywgdHJhaW5zLCBzZXJ2aWNlcyBhbmQgc3RhdGlvbnMgKi9cclxuY2xhc3MgRGF0YWJhc2Vcclxue1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGV4Y3VzZXMgICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBuYW1lZCB0cmFpbnMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbmFtZWQgICAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIHNlcnZpY2Ugb3IgbmV0d29yayBuYW1lcyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXJ2aWNlcyAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBuYW1lcywgd2l0aCB0aHJlZS1sZXR0ZXIgY29kZSBrZXlzIChlLmcuIEFCQykgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc3RhdGlvbnMgICAgICA6IERpY3Rpb25hcnk8U3RhdGlvbj47XHJcbiAgICAvKiogTG9hZGVkIFhNTCBkb2N1bWVudCBjb250YWluaW5nIHBocmFzZXNldCBkYXRhICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHBocmFzZXNldHMgICAgOiBEb2N1bWVudDtcclxuICAgIC8qKiBBbW91bnQgb2Ygc3RhdGlvbnMgaW4gdGhlIGN1cnJlbnRseSBsb2FkZWQgZGF0YXNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzdGF0aW9uc0NvdW50IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihkYXRhUmVmczogRGF0YVJlZnMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICA9IGRhdGFSZWZzLnBocmFzZXNldEVtYmVkO1xyXG4gICAgICAgIGxldCBpZnJhbWUgPSBET00ucmVxdWlyZSA8SFRNTElGcmFtZUVsZW1lbnQ+IChxdWVyeSk7XHJcblxyXG4gICAgICAgIGlmICghaWZyYW1lLmNvbnRlbnREb2N1bWVudClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRShxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgdGhpcy5waHJhc2VzZXRzICAgID0gaWZyYW1lLmNvbnRlbnREb2N1bWVudDtcclxuICAgICAgICB0aGlzLmV4Y3VzZXMgICAgICAgPSBkYXRhUmVmcy5leGN1c2VzRGF0YTtcclxuICAgICAgICB0aGlzLm5hbWVkICAgICAgICAgPSBkYXRhUmVmcy5uYW1lZERhdGE7XHJcbiAgICAgICAgdGhpcy5zZXJ2aWNlcyAgICAgID0gZGF0YVJlZnMuc2VydmljZXNEYXRhO1xyXG4gICAgICAgIHRoaXMuc3RhdGlvbnMgICAgICA9IGRhdGFSZWZzLnN0YXRpb25zRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zQ291bnQgPSBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGg7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbRGF0YWJhc2VdIEVudHJpZXMgbG9hZGVkOicpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRFeGN1c2VzOicsICAgICAgdGhpcy5leGN1c2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdE5hbWVkIHRyYWluczonLCB0aGlzLm5hbWVkLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFNlcnZpY2VzOicsICAgICB0aGlzLnNlcnZpY2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFN0YXRpb25zOicsICAgICB0aGlzLnN0YXRpb25zQ291bnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBleGN1c2UgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgcGlja0V4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLmV4Y3VzZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHBpY2tOYW1lZCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsb25lcyBhbmQgZ2V0cyBwaHJhc2Ugd2l0aCB0aGUgZ2l2ZW4gSUQsIG9yIG51bGwgaWYgaXQgZG9lc24ndCBleGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZSB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZShpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlIycgKyBpZCkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmIChyZXN1bHQpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgcGhyYXNlc2V0IHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuIE5vdGUgdGhhdCB0aGVcclxuICAgICAqIHJldHVybmVkIHBocmFzZXNldCBjb21lcyBmcm9tIHRoZSBYTUwgZG9jdW1lbnQsIHNvIGl0IHNob3VsZCBub3QgYmUgbXV0YXRlZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZXNldCB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldChpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlc2V0IycgKyBpZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgcGlja1NlcnZpY2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5zZXJ2aWNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBzdGF0aW9uIGNvZGUgZnJvbSB0aGUgZGF0YXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZSBMaXN0IG9mIGNvZGVzIHRvIGV4Y2x1ZGUuIE1heSBiZSBpZ25vcmVkIGlmIHNlYXJjaCB0YWtlcyB0b28gbG9uZy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHBpY2tTdGF0aW9uQ29kZShleGNsdWRlPzogc3RyaW5nW10pIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgLy8gR2l2ZSB1cCBmaW5kaW5nIHJhbmRvbSBzdGF0aW9uIHRoYXQncyBub3QgaW4gdGhlIGdpdmVuIGxpc3QsIGlmIHdlIHRyeSBtb3JlXHJcbiAgICAgICAgLy8gdGltZXMgdGhlbiB0aGVyZSBhcmUgc3RhdGlvbnMuIEluYWNjdXJhdGUsIGJ1dCBhdm9pZHMgaW5maW5pdGUgbG9vcHMuXHJcbiAgICAgICAgaWYgKGV4Y2x1ZGUpIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdGF0aW9uc0NvdW50OyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCAhZXhjbHVkZS5pbmNsdWRlcyh2YWx1ZSkgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBzdGF0aW9uIG5hbWUgZnJvbSB0aGUgZ2l2ZW4gdGhyZWUgbGV0dGVyIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBnZXQgdGhlIG5hbWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFN0YXRpb24gbmFtZSBmb3IgdGhlIGdpdmVuIGNvZGVcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gdGhpcy5zdGF0aW9uc1tjb2RlXTtcclxuXHJcbiAgICAgICAgaWYgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9VTktOT1dOX1NUQVRJT04oY29kZSk7XHJcblxyXG4gICAgICAgIGlmICh0eXBlb2Ygc3RhdGlvbiA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmdzLmlzTnVsbE9yRW1wdHkoc3RhdGlvbilcclxuICAgICAgICAgICAgICAgID8gTC5EQl9FTVBUWV9TVEFUSU9OKGNvZGUpXHJcbiAgICAgICAgICAgICAgICA6IHN0YXRpb247XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gIXN0YXRpb24ubmFtZVxyXG4gICAgICAgICAgICAgICAgPyBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSlcclxuICAgICAgICAgICAgICAgIDogc3RhdGlvbi5uYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlJ3Mgdm94IGFsaWFzLCBpZiBhbnkuIEEgdm94IGFsaWFzIGlzIHRoZSBjb2RlIG9mIGFub3RoZXJcclxuICAgICAqIHN0YXRpb24ncyB2b2ljZSBmaWxlLCB0aGF0IHRoZSBnaXZlbiBjb2RlIHNob3VsZCB1c2UgaW5zdGVhZC4gVGhpcyBpcyB1c2VkIGZvclxyXG4gICAgICogc3RhdGlvbnMgd2l0aCBkdXBsaWNhdGUgbmFtZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIGdldCB0aGUgdm94IGFsaWFzIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgYWxpYXMgY29kZSwgZWxzZSB0aGUgZ2l2ZW4gY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvblZveChjb2RlOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSB0aGlzLnN0YXRpb25zW2NvZGVdO1xyXG5cclxuICAgICAgICAvLyBVbmtub3duIHN0YXRpb25cclxuICAgICAgICBpZiAgICAgICghc3RhdGlvbilcclxuICAgICAgICAgICAgcmV0dXJuICc/Pz8nO1xyXG4gICAgICAgIC8vIFN0YXRpb24gaXMganVzdCBhIHN0cmluZzsgYXNzdW1lIG5vIGFsaWFzXHJcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHN0YXRpb24gPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gY29kZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiBlaXRoZXIoc3RhdGlvbi52b3hBbGlhcywgY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSByYW5nZSBvZiBzdGF0aW9uIGNvZGVzLCBlbnN1cmluZyB0aGVyZSBhcmUgbm8gZHVwbGljYXRlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVcclxuICAgICAqIEByZXR1cm5zIEEgbGlzdCBvZiB1bmlxdWUgc3RhdGlvbiBuYW1lc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlcyhtaW4gPSAxLCBtYXggPSAxNiwgZXhjbHVkZT8gOiBzdHJpbmdbXSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChtYXggLSBtaW4gPiBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX1RPT19NQU5ZX1NUQVRJT05TKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGxlbmd0aCA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIGxldCB0cmllcyAgPSAwO1xyXG5cclxuICAgICAgICB3aGlsZSAocmVzdWx0Lmxlbmd0aCA8IGxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB1cCB0cnlpbmcgdG8gYXZvaWQgZHVwbGljYXRlcywgaWYgd2UgdHJ5IG1vcmUgdGltZXMgdGhhbiB0aGVyZSBhcmVcclxuICAgICAgICAgICAgLy8gc3RhdGlvbnMgYXZhaWxhYmxlLiBJbmFjY3VyYXRlLCBidXQgZ29vZCBlbm91Z2guXHJcbiAgICAgICAgICAgIGlmICh0cmllcysrID49IHRoaXMuc3RhdGlvbnNDb3VudClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhbiBleGNsdXNpb24gbGlzdCwgY2hlY2sgYWdhaW5zdCBib3RoIHRoYXQgYW5kIHJlc3VsdHNcclxuICAgICAgICAgICAgZWxzZSBpZiAoIGV4Y2x1ZGUgJiYgIWV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCwganVzdCBjaGVjayB3aGF0IHJlc3VsdHMgd2UndmUgYWxyZWFkeSBmb3VuZFxyXG4gICAgICAgICAgICBlbHNlIGlmICggIWV4Y2x1ZGUgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1haW4gY2xhc3Mgb2YgdGhlIGVudGlyZSBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yIGFwcGxpY2F0aW9uICovXHJcbmNsYXNzIFJBR1xyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgY29uZmlndXJhdGlvbiBjb250YWluZXIgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY29uZmlnICAgIDogQ29uZmlnO1xyXG4gICAgLyoqIEdldHMgdGhlIGRhdGFiYXNlIG1hbmFnZXIsIHdoaWNoIGhvbGRzIHBocmFzZSwgc3RhdGlvbiBhbmQgdHJhaW4gZGF0YSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBkYXRhYmFzZSAgOiBEYXRhYmFzZTtcclxuICAgIC8qKiBHZXRzIHRoZSBwaHJhc2UgbWFuYWdlciwgd2hpY2ggZ2VuZXJhdGVzIEhUTUwgcGhyYXNlcyBmcm9tIFhNTCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VyICAgOiBQaHJhc2VyO1xyXG4gICAgLyoqIEdldHMgdGhlIHNwZWVjaCBlbmdpbmUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3BlZWNoICAgIDogU3BlZWNoO1xyXG4gICAgLyoqIEdldHMgdGhlIGN1cnJlbnQgdHJhaW4gYW5kIHN0YXRpb24gc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGUgICAgIDogU3RhdGU7XHJcbiAgICAvKiogR2V0cyB0aGUgdmlldyBjb250cm9sbGVyLCB3aGljaCBtYW5hZ2VzIFVJIGludGVyYWN0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZpZXdzICAgICA6IFZpZXdzO1xyXG4gICAgLyoqIEdldHMgdGhlIHNjZW5hcmlvIHJ1bm5lciwgd2hpY2ggY2hhaW5zIGFubm91bmNlbWVudHMgaW50byBhIHNlcXVlbmNlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNjZW5hcmlvICA6IFNjZW5hcmlvO1xyXG4gICAgLyoqIEdldHMgdGhlIHNjZW5hcmlvIGRhc2hib2FyZCBjb250cm9sbGVyICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGRhc2hib2FyZCA6IFNjZW5hcmlvRGFzaGJvYXJkO1xyXG4gICAgLyoqIENyb3NzLXdpbmRvdyBtZXNzYWdpbmcgY2hhbm5lbCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjaGFubmVsICAgOiBTY2VuYXJpb0NoYW5uZWw7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFbnRyeSBwb2ludCBmb3IgUkFHLCB0byBiZSBjYWxsZWQgZnJvbSBKYXZhc2NyaXB0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBkYXRhUmVmcyBDb25maWd1cmF0aW9uIG9iamVjdCwgd2l0aCByYWlsIGRhdGEgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFpbihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5vbmVycm9yICAgICAgICAgICAgICA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcbiAgICAgICAgd2luZG93Lm9udW5oYW5kbGVkcmVqZWN0aW9uID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuXHJcbiAgICAgICAgSTE4bi5pbml0KCk7XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcgICAgPSBuZXcgQ29uZmlnKHRydWUpO1xyXG4gICAgICAgIFJBRy5kYXRhYmFzZSAgPSBuZXcgRGF0YWJhc2UoZGF0YVJlZnMpO1xyXG4gICAgICAgIFJBRy5waHJhc2VyICAgPSBuZXcgUGhyYXNlcigpO1xyXG4gICAgICAgIFJBRy5zcGVlY2ggICAgPSBuZXcgU3BlZWNoKCk7XHJcbiAgICAgICAgUkFHLnNjZW5hcmlvICA9IG5ldyBTY2VuYXJpbygpO1xyXG4gICAgICAgIFJBRy52aWV3cyAgICAgPSBuZXcgVmlld3MoKTtcclxuICAgICAgICBSQUcuZGFzaGJvYXJkID0gbmV3IFNjZW5hcmlvRGFzaGJvYXJkKCk7XHJcbiAgICAgICAgUkFHLmNoYW5uZWwgICA9IG5ldyBTY2VuYXJpb0NoYW5uZWwoKTtcclxuXHJcbiAgICAgICAgLy8gUmVnaXN0ZXIgY3Jvc3Mtd2luZG93IGxpc3RlbmVycyBvbiBtYWluIGluZGV4Lmh0bWwgcGFnZVxyXG4gICAgICAgIFJBRy5yZWdpc3RlckNoYW5uZWxIYW5kbGVycygpO1xyXG5cclxuICAgICAgICAvLyBCZWdpblxyXG4gICAgICAgIFJBRy52aWV3cy5kaXNjbGFpbWVyLmRpc2NsYWltKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KEwuV0VMQ09NRSk7XHJcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XHJcblxyXG4gICAgICAgIC8vIFBpbmcgZGFzaGJvYXJkIGlmIG9wZW5cclxuICAgICAgICBSQUcuY2hhbm5lbC5zZW5kKCdQT05HJywgeyBzdGF0ZUpzb246IEpTT04uc3RyaW5naWZ5KFJBRy5zdGF0ZSkgfSk7XHJcblxyXG4gICAgICAgIC8vIERldGVybWluZSB0aGlzIHBhZ2UncyByb2xlLiBUaGUgZGFzaGJvYXJkIHJvbGUgaXMgdGhlIGNvbnRyb2xsZXJcclxuICAgICAgICAvLyAoYnVpbGQgLyBtYW5hZ2UgLyBydW4pOyB0aGUgZWRpdG9yIHJvbGUgaXMgdGhlIG1haW4gcGFnZSAoZGlzcGxheSArXHJcbiAgICAgICAgLy8gc3RlcCBlZGl0aW5nKS4gQm90aCBhcmUgdGhlIHNhbWUgYXBwLCBkaXN0aW5ndWlzaGVkIGJ5IHRoZSBVUkwuXHJcbiAgICAgICAgaWYgKFJBRy5pc0Rhc2hib2FyZFJvbGUoKSlcclxuICAgICAgICAgICAgUkFHLmRhc2hib2FyZC5vcGVuKCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgUkFHLmFwcGx5RWRpdFJlcXVlc3QoKTtcclxuICAgICAgICAgICAgUkFHLmJpbmRQbGF5YmFja0dhdGUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRydWUgd2hlbiB0aGlzIHBhZ2Ugd2FzIG9wZW5lZCBhcyB0aGUgZGFzaGJvYXJkIChjb250cm9sbGVyKSB2aWV3ICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpc0Rhc2hib2FyZFJvbGUoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBsZXQgc2VhcmNoID0gd2luZG93LmxvY2F0aW9uLnNlYXJjaCB8fCAnJztcclxuICAgICAgICBsZXQgaGFzaCAgID0gd2luZG93LmxvY2F0aW9uLmhhc2ggICB8fCAnJztcclxuICAgICAgICByZXR1cm4gc2VhcmNoLmluZGV4T2YoJ2Rhc2hib2FyZD0xJykgIT09IC0xIHx8IGhhc2guaW5kZXhPZignZGFzaGJvYXJkJykgIT09IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRWRpdG9yIHJvbGU6IGlmIHRoZSBkYXNoYm9hcmQgYXNrZWQgdG8gZWRpdCBhIHNwZWNpZmljIHN0ZXAsIGxvYWQgdGhhdFxyXG4gICAgICogc3RlcCdzIGFubm91bmNlbWVudCBpbnRvIHRoZSBlZGl0b3IgYW5kIHBvaW50IFwiVXBkYXRlIFN0ZXBcIiBhdCBpdC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgYXBwbHlFZGl0UmVxdWVzdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3JhZy5lZGl0UmVxdWVzdCcpICE9PSAnMScpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdyYWcuZWRpdFJlcXVlc3QnKTtcclxuXHJcbiAgICAgICAgbGV0IGlkICAgICA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgncmFnLmN1cnJlbnRTY2VuYXJpb0lkJyk7XHJcbiAgICAgICAgbGV0IGlkeFN0ciA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgncmFnLnNlbGVjdGVkU3RlcEluZGV4Jyk7XHJcbiAgICAgICAgaWYgKCFpZCB8fCBpZHhTdHIgPT09IG51bGwpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KGlkeFN0cik7XHJcbiAgICAgICAgbGV0IHJhdyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgncmFnLnNjZW5hcmlvcycpO1xyXG4gICAgICAgIGlmICghcmF3KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCBzY2VuYXJpb3MgPSBKU09OLnBhcnNlKHJhdykgYXMgQXJyYXk8eyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IHN0ZXBzOiBBcnJheTx7IHN0YXRlSnNvbj86IHN0cmluZyB9PiB9PjtcclxuICAgICAgICBsZXQgc2MgICA9IHNjZW5hcmlvcy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xyXG4gICAgICAgIGxldCBzdGVwID0gKHNjICYmIHNjLnN0ZXBzW2lkeF0pID8gc2Muc3RlcHNbaWR4XSA6IG51bGw7XHJcbiAgICAgICAgaWYgKCFzdGVwIHx8ICFzdGVwLnN0YXRlSnNvbilcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBSQUcubG9hZChzdGVwLnN0YXRlSnNvbik7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdFZGl0aW5nIHN0ZXAgJyArIChpZHggKyAxKSArICcgb2YgXCInICsgc2MhLm5hbWUgKyAnXCIuIE1ha2UgeW91ciBjaGFuZ2VzLCB0aGVuIGNsaWNrIFwiVXBkYXRlIFN0ZXBcIiB0byBzYXZlIHRoZW0gYmFjay4nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEVkaXRvciByb2xlOiBwYXVzZSBlZGl0aW5nIHdoaWxlIGEgc2NlbmFyaW8gaXMgcGxheWluZyBpbiBhbm90aGVyIHRhYi5cclxuICAgICAqIFRoZSBkYXNoYm9hcmQgdGFiIHNldHMgcmFnLnBsYXliYWNrQWN0aXZlOyB3ZSByZWFjdCB0byBpdCBsaXZlLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBiaW5kUGxheWJhY2tHYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGFwcGx5ID0gKGFjdGl2ZTogYm9vbGVhbikgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmICghUkFHLnZpZXdzKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1haW4uc3R5bGUucG9pbnRlckV2ZW50cyA9IGFjdGl2ZSA/ICdub25lJyA6ICcnO1xyXG4gICAgICAgICAgICBsZXQgdG9vbGJhciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0b29sYmFyJyk7XHJcbiAgICAgICAgICAgIGlmICh0b29sYmFyKVxyXG4gICAgICAgICAgICAgICAgdG9vbGJhci5zdHlsZS5wb2ludGVyRXZlbnRzID0gYWN0aXZlID8gJ25vbmUnIDogJyc7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgbGV0IGNoZWNrID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBhY3RpdmUgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3JhZy5wbGF5YmFja0FjdGl2ZScpID09PSAnMSc7XHJcbiAgICAgICAgICAgIGlmIChhY3RpdmUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIC8vIFRoZSBkYXNoYm9hcmQgdGFiIHJlZnJlc2hlcyB0aGlzIGhlYXJ0YmVhdCB3aGlsZSBpdCBpc1xyXG4gICAgICAgICAgICAgICAgLy8gYWxpdmU7IGEgc3RhbGUgc3RhbXAgbWVhbnMgaXQgY2xvc2VkIChvciBjcmFzaGVkKSBtaWQtXHJcbiAgICAgICAgICAgICAgICAvLyBwbGF5YmFjaywgc28gcmVsZWFzZSB0aGUgbG9jayBpbnN0ZWFkIG9mIGhvbGRpbmcgdGhlXHJcbiAgICAgICAgICAgICAgICAvLyBlZGl0b3IgaG9zdGFnZSBmb3JldmVyLlxyXG4gICAgICAgICAgICAgICAgbGV0IHNpbmNlID0gcGFyc2VJbnQod2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdyYWcucGxheWJhY2tTaW5jZScpIHx8ICcwJywgMTApO1xyXG4gICAgICAgICAgICAgICAgaWYgKERhdGUubm93KCkgLSBzaW5jZSA+IDE1ICogMTAwMClcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ3JhZy5wbGF5YmFja0FjdGl2ZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgncmFnLnBsYXliYWNrU2luY2UnKTtcclxuICAgICAgICAgICAgICAgICAgICBhY3RpdmUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBhcHBseShhY3RpdmUpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNoZWNrKCk7XHJcblxyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzdG9yYWdlJywgKGU6IFN0b3JhZ2VFdmVudCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ3JhZy5wbGF5YmFja0FjdGl2ZScgfHwgZS5rZXkgPT09ICdyYWcucGxheWJhY2tTaW5jZScpXHJcbiAgICAgICAgICAgICAgICBjaGVjaygpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBTdG9yYWdlIGV2ZW50cyBvbmx5IGZpcmUgb24gYSB3cml0ZTsgYSBkZWFkIGRhc2hib2FyZCB0YWIgc3RvcHNcclxuICAgICAgICAvLyB3cml0aW5nLCBzbyBhbHNvIHJlLWNoZWNrIG9uIGEgdGltZXIgdG8gY2F0Y2ggYSBzdGFsZSBsb2NrLlxyXG4gICAgICAgIHdpbmRvdy5zZXRJbnRlcnZhbChjaGVjaywgNSAqIDEwMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRWRpdG9yIHJvbGU6IG1pcnJvciBhIHN0ZXAgdGhlIGRhc2hib2FyZCBpcyBydW5uaW5nIGludG8gdGhlIG1hcnF1ZWUuXHJcbiAgICAgKiBEaXNwbGF5LW9ubHkgb24gcHVycG9zZTogdGhlIGRhc2hib2FyZCB0YWIgb3ducyB0aGUgYXVkaW8sIGFuZCBzcGVha2luZ1xyXG4gICAgICogaGVyZSB0b28gd291bGQgZG91YmxlIHRoZSB2b2ljZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWlycm9yU3RlcChtc2c6IGFueSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFSQUcudmlld3MpIHJldHVybjtcclxuICAgICAgICBsZXQgdGV4dCA9IChtc2cgJiYgbXNnLnRleHQpID8gU3RyaW5nKG1zZy50ZXh0KSA6ICcnO1xyXG4gICAgICAgIGlmICh0ZXh0KVxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQodGV4dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZ2lzdGVyIGNoYW5uZWwgaGFuZGxlcnMgZm9yIHRoZSBtYWluIHNjcmVlbiAoaW5kZXguaHRtbCkgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlZ2lzdGVyQ2hhbm5lbEhhbmRsZXJzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNoYW5uZWwub24oJ1BJTkcnLCAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgUkFHLmNoYW5uZWwuc2VuZCgnUE9ORycsIHsgc3RhdGVKc29uOiBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBSQUcuY2hhbm5lbC5vbignTE9BRF9TVEVQJywgKG1zZzogYW55KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKG1zZy5zdGF0ZUpzb24pXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIFJBRy5sb2FkKG1zZy5zdGF0ZUpzb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFRoZSBkYXNoYm9hcmQgdGFiIG93bnMgcGxheWJhY2sgKGF1ZGlvICsgcnVubmVyKTsgdGhlIGVkaXRvciBvbmx5XHJcbiAgICAgICAgLy8gbWlycm9ycyB0aGUgdmlzaWJsZSB0ZXh0LCBzbyB0aGUgdm9pY2UgaXMgbmV2ZXIgZG91YmxlZC5cclxuICAgICAgICBSQUcuY2hhbm5lbC5vbignUExBWV9TSU5HTEVfU1RFUCcsIChtc2c6IGFueSkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy5taXJyb3JTdGVwKG1zZyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIFJBRy5jaGFubmVsLm9uKCdQTEFZX1NDRU5BUklPX1NURVAnLCAobXNnOiBhbnkpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBSQUcubWlycm9yU3RlcChtc2cpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBSQUcuY2hhbm5lbC5vbignV0FJVF9DT1VOVERPV04nLCAobXNnOiBhbnkpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAoIVJBRy52aWV3cykgcmV0dXJuO1xyXG4gICAgICAgICAgICBsZXQgc2VjcyA9IChtc2cgJiYgbXNnLnJlbWFpbmluZ1NlY29uZHMgIT09IHVuZGVmaW5lZCkgPyBtc2cucmVtYWluaW5nU2Vjb25kcyA6IChtc2cgJiYgbXNnLnJlbWFpbmluZyk7XHJcbiAgICAgICAgICAgIGlmIChzZWNzID09PSB1bmRlZmluZWQpIHJldHVybjtcclxuICAgICAgICAgICAgLy8gc2V0U29mdDogc3dhcCB0aGUgdGV4dCBpbiBwbGFjZSBzbyB0aGUgdGlja3MgZG9uJ3QgcmVzdGFydCB0aGUgc2Nyb2xsIGV2ZXJ5IHNlY29uZFxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXRTb2Z0KGBXYWl0aW5nICR7c2Vjc31zLi4uYCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIFJBRy5jaGFubmVsLm9uKCdTVE9QX1BMQVlCQUNLJywgKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChSQUcudmlld3MpXHJcbiAgICAgICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0lkbGUnLCBmYWxzZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIFJBRy5jaGFubmVsLm9uKCdDQVBUVVJFX1NURVBfUkVRVUVTVCcsIChtc2c6IGFueSkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLnNlbmQoJ0NBUFRVUkVEX1NURVBfREFUQScsIHsgbm9uY2U6IG1zZyA/IG1zZy5ub25jZSA6IHVuZGVmaW5lZCwgc3RhdGVKc29uOiBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpIH0pO1xyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0NhcHR1cmVkIHN0ZXAgZm9yIERhc2hib2FyZCBzY2VuYXJpbycpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBOb3RpZnkgZXh0ZXJuYWwgbGlzdGVuZXJzIChkYXNoYm9hcmQpIHRoYXQgdGhlIGN1cnJlbnQgc3RhdGUgaW4gZWRpdG9yIGNoYW5nZWQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbm90aWZ5U3RhdGVDaGFuZ2VkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKFJBRy5jaGFubmVsICYmIFJBRy5zdGF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLnNlbmQoJ1NUQVRFX0NIQU5HRUQnLCB7IHN0YXRlSnNvbjogSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKSB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdlbmVyYXRlcyBhIG5ldyByYW5kb20gcGhyYXNlIGFuZCBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IG5ldyBTdGF0ZSgpO1xyXG4gICAgICAgIFJBRy5zdGF0ZS5nZW5EZWZhdWx0U3RhdGUoKTtcclxuICAgICAgICBpZiAoUkFHLnZpZXdzICYmIFJBRy52aWV3cy5lZGl0b3IpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmdlbmVyYXRlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFJBRy5ub3RpZnlTdGF0ZUNoYW5nZWQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogTG9hZHMgc3RhdGUgZnJvbSBnaXZlbiBKU09OICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWQoanNvbjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBPYmplY3QuYXNzaWduKCBuZXcgU3RhdGUoKSwgSlNPTi5wYXJzZShqc29uKSApIGFzIFN0YXRlO1xyXG4gICAgICAgIGlmIChSQUcudmlld3MgJiYgUkFHLnZpZXdzLmVkaXRvcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuZ2VuZXJhdGUoKTtcclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KEwuU1RBVEVfRlJPTV9TVE9SQUdFKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgUkFHLm5vdGlmeVN0YXRlQ2hhbmdlZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHbG9iYWwgZXJyb3IgaGFuZGxlcjsgdGhyb3dzIHVwIGEgYmlnIHJlZCBwYW5pYyBzY3JlZW4gb24gdW5jYXVnaHQgZXJyb3IgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHBhbmljKGVycm9yOiBzdHJpbmcgfCBFdmVudCA9IFwiVW5rbm93biBlcnJvclwiKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBtc2cgPSAnPGRpdiBpZD1cInBhbmljU2NyZWVuXCIgY2xhc3M9XCJ3YXJuaW5nU2NyZWVuXCI+JyAgICAgICAgICArXHJcbiAgICAgICAgICAgICAgICAgICc8aDE+XCJXZSBhcmUgc29ycnkgdG8gYW5ub3VuY2UgdGhhdC4uLlwiPC9oMT4nICAgICAgICAgICArXHJcbiAgICAgICAgICAgICAgICAgIGA8cD5SQUcgaGFzIGNyYXNoZWQgYmVjYXVzZTogPGNvZGU+JHtlcnJvcn08L2NvZGU+PC9wPmAgK1xyXG4gICAgICAgICAgICAgICAgICBgPHA+UGxlYXNlIG9wZW4gdGhlIGNvbnNvbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24uPC9wPmAgICtcclxuICAgICAgICAgICAgICAgICAgJzwvZGl2Pic7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5uZXJIVE1MID0gbXNnO1xyXG4gICAgfVxyXG59XHJcbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEaXNwb3NhYmxlIGNsYXNzIHRoYXQgaG9sZHMgc3RhdGUgZm9yIHRoZSBjdXJyZW50IHNjaGVkdWxlLCB0cmFpbiwgZXRjLiAqL1xyXG5jbGFzcyBTdGF0ZVxyXG57XHJcbiAgICAvKiogU3RhdGUgb2YgY29sbGFwc2libGUgZWxlbWVudHMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGNvbGxhcHNlZC4gKi9cclxuICAgIHByaXZhdGUgX2NvbGxhcHNpYmxlcyA6IERpY3Rpb25hcnk8Ym9vbGVhbj4gID0ge307XHJcbiAgICAvKiogQ3VycmVudCBjb2FjaCBsZXR0ZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGxldHRlci4gKi9cclxuICAgIHByaXZhdGUgX2NvYWNoZXMgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBpbnRlZ2VyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBpbnRlZ2VyLiAqL1xyXG4gICAgcHJpdmF0ZSBfaW50ZWdlcnMgICAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHBocmFzZXNldCBwaHJhc2UgY2hvaWNlcy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgaW5kZXguICovXHJcbiAgICBwcml2YXRlIF9waHJhc2VzZXRzICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc2VydmljZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc2VydmljZS4gKi9cclxuICAgIHByaXZhdGUgX3NlcnZpY2VzICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzdGF0aW9uIGNvZGUuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9ucyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBsaXN0IGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBhcnJheSBvZiBjb2Rlcy4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25MaXN0cyA6IERpY3Rpb25hcnk8c3RyaW5nW10+ID0ge307XHJcbiAgICAvKiogQ3VycmVudCB0aW1lIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyB0aW1lLiAqL1xyXG4gICAgcHJpdmF0ZSBfdGltZXMgICAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuXHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBleGN1c2UgKi9cclxuICAgIHByaXZhdGUgX2V4Y3VzZT8gICA6IHN0cmluZztcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIHBsYXRmb3JtICovXHJcbiAgICBwcml2YXRlIF9wbGF0Zm9ybT8gOiBQbGF0Zm9ybTtcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIG5hbWVkIHRyYWluICovXHJcbiAgICBwcml2YXRlIF9uYW1lZD8gICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGNvYWNoIGxldHRlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lIGZyb20gQSB0byBaLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgbGV0dGVyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29hY2goY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2FjaGVzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gUmFuZG9tLmFycmF5KEwuTEVUVEVSUyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29hY2ggbGV0dGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29hY2ggVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2FjaChjb250ZXh0OiBzdHJpbmcsIGNvYWNoOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBjb2FjaDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBiZXR3ZWVuIDAgYW5kIDEwMCBvZiBjaG9vc2luZyB0cnVlLCBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBjaGFuY2U6IG51bWJlcikgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSAhUmFuZG9tLmJvb2woY2hhbmNlKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29sbGFwc2libGUncyBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVmFsdWUgdG8gc2V0LCB3aGVyZSB0cnVlIGlzIFwiY29sbGFwc2VkXCJcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvbGxhcHNlZChyZWY6IHN0cmluZywgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gc3RhdGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGludGVnZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5faW50ZWdlcnNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMCwgbWF4ID0gMDtcclxuXHJcbiAgICAgICAgc3dpdGNoKGNvbnRleHQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29hY2hlc1wiOiAgICAgICBtaW4gPSAxOyBtYXggPSAxMDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJkZWxheWVkXCI6ICAgICAgIG1pbiA9IDU7IG1heCA9IDYwOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImZyb250X2NvYWNoZXNcIjogbWluID0gMjsgbWF4ID0gNTsgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicmVhcl9jb2FjaGVzXCI6ICBtaW4gPSAyOyBtYXggPSA1OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYW4gaW50ZWdlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEludGVnZXIoY29udGV4dDogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBwaHJhc2Ugb2YgYSBwaHJhc2VzZXQsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBwaHJhc2VzZXQncyBwaHJhc2Ugb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldElkeChyZWY6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG4gICAgICAgIGxldCBpZHggICAgICAgPSB0aGlzLl9waHJhc2VzZXRzW3JlZl07XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGludHJvZHVjZSBhbiBhc3NlcnRzIHV0aWwsIGFuZCBzdGFydCB1c2luZyB0aGVtIGFsbCBvdmVyXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlNUQVRFX0JBRF9QSFJBU0VTRVQocmVmKSApO1xyXG5cclxuICAgICAgICAvLyBWZXJpZnkgaW5kZXggaXMgdmFsaWQsIGVsc2UgcmVqZWN0IGFuZCBwaWNrIHJhbmRvbVxyXG4gICAgICAgIGlmIChpZHggPT09IHVuZGVmaW5lZCB8fCBwaHJhc2VzZXQuY2hpbGRyZW5baWR4XSA9PT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBSYW5kb20uaW50KDAsIHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGggLSAxKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNob3NlbiBpbmRleCBmb3IgYSBwaHJhc2VzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBwaHJhc2VzZXQgaW5kZXggb2ZcclxuICAgICAqIEBwYXJhbSBpZHggSW5kZXggdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcsIGlkeDogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBpZHg7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHNlcnZpY2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc2VydmljZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU2VydmljZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzZXJ2aWNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzZXJ2aWNlIGZvclxyXG4gICAgICogQHBhcmFtIHNlcnZpY2UgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZywgc2VydmljZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IHNlcnZpY2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHN0YXRpb24gY29kZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzdGF0aW9uIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBmb3JcclxuICAgICAqIEBwYXJhbSBjb2RlIFN0YXRpb24gY29kZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb24oY29udGV4dDogc3RyaW5nLCBjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gY29kZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gbGlzdCBvZiBzdGF0aW9uIGNvZGVzLCBvciByYW5kb21seSBnZW5lcmF0ZXMgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBsaXN0IGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbkxpc3QoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgICAgIGVsc2UgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmcnKTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDEsIG1heCA9IDE2O1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NhbGxpbmdfc3BsaXQnOiBtaW4gPSAyOyBtYXggPSAxNjsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NoYW5nZXMnOiAgICAgICBtaW4gPSAxOyBtYXggPSA0OyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ25vdF9zdG9wcGluZyc6ICBtaW4gPSAxOyBtYXggPSA4OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcyhtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBsaXN0IG9mIHN0YXRpb24gY29kZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBsaXN0IGZvclxyXG4gICAgICogQHBhcmFtIGNvZGVzIFN0YXRpb24gY29kZXMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcsIGNvZGVzOiBzdHJpbmdbXSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdID0gY29kZXM7XHJcblxyXG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnY2FsbGluZ19maXJzdCcpXHJcbiAgICAgICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1snY2FsbGluZyddID0gY29kZXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHRpbWVcclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHRpbWUgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRUaW1lKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fdGltZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IFN0cmluZ3MuZnJvbVRpbWUoIFJhbmRvbS5pbnQoMCwgMjMpLCBSYW5kb20uaW50KDAsIDU5KSApO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl90aW1lc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSB0aW1lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSB0aW1lIGZvclxyXG4gICAgICogQHBhcmFtIHRpbWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRUaW1lKGNvbnRleHQ6IHN0cmluZywgdGltZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IHRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBleGN1c2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBleGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9leGN1c2UpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9leGN1c2U7XHJcblxyXG4gICAgICAgIHRoaXMuX2V4Y3VzZSA9IFJBRy5kYXRhYmFzZS5waWNrRXhjdXNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBzZXQgZXhjdXNlKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBwbGF0Zm9ybSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IHBsYXRmb3JtKCkgOiBQbGF0Zm9ybVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9wbGF0Zm9ybSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXRmb3JtO1xyXG5cclxuICAgICAgICBsZXQgcGxhdGZvcm0gOiBQbGF0Zm9ybSA9IFsnJywgJyddO1xyXG5cclxuICAgICAgICAvLyBPbmx5IDIlIGNoYW5jZSBmb3IgcGxhdGZvcm0gMCwgc2luY2UgaXQncyByYXJlXHJcbiAgICAgICAgcGxhdGZvcm1bMF0gPSBSYW5kb20uYm9vbCg5OClcclxuICAgICAgICAgICAgPyBSYW5kb20uaW50KDEsIDI2KS50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogJzAnO1xyXG5cclxuICAgICAgICAvLyBNYWdpYyB2YWx1ZXNcclxuICAgICAgICBpZiAocGxhdGZvcm1bMF0gPT09ICc5JylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgyNSkgPyAnwr4nIDogJyc7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMTAlIGNoYW5jZSBmb3IgcGxhdGZvcm0gbGV0dGVyLCBzaW5jZSBpdCdzIHVuY29tbW9uXHJcbiAgICAgICAgaWYgKHBsYXRmb3JtWzFdID09PSAnJylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgxMClcclxuICAgICAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCdBQkMnKVxyXG4gICAgICAgICAgICAgICAgOiAnJztcclxuXHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSBwbGF0Zm9ybTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzZXQgcGxhdGZvcm0odmFsdWU6IFBsYXRmb3JtKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBuYW1lZCB0cmFpbiwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IG5hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fbmFtZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuXHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSBSQUcuZGF0YWJhc2UucGlja05hbWVkKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc2V0IG5hbWVkKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgdGhlIHN0YXRlIGluIGEgcGFydGljdWxhciB3YXksIHNvIHRoYXQgaXQgbWFrZXMgc29tZSByZWFsLXdvcmxkIHNlbnNlLlxyXG4gICAgICogVG8gZG8gc28sIHdlIGhhdmUgdG8gZ2VuZXJhdGUgZGF0YSBpbiBhIHBhcnRpY3VsYXIgb3JkZXIsIGFuZCBtYWtlIHN1cmUgdG8gYXZvaWRcclxuICAgICAqIGR1cGxpY2F0ZXMgaW4gaW5hcHByb3ByaWF0ZSBwbGFjZXMgYW5kIGNvbnRleHRzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2VuRGVmYXVsdFN0YXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RlcCAxLiBQcmVwb3B1bGF0ZSBzdGF0aW9uIGxpc3RzXHJcblxyXG4gICAgICAgIGxldCBzbENhbGxpbmcgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDE2KTtcclxuICAgICAgICBsZXQgc2xDYWxsU3BsaXQgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygyLCAxNiwgc2xDYWxsaW5nKTtcclxuICAgICAgICBsZXQgYWxsQ2FsbGluZyAgPSBbLi4uc2xDYWxsaW5nLCAuLi5zbENhbGxTcGxpdF07XHJcblxyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgZm91bmQgdmlhIGEgc3BlY2lmaWMgY2FsbGluZyBwb2ludFxyXG4gICAgICAgIGxldCBzbENoYW5nZXMgICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgNCwgYWxsQ2FsbGluZyk7XHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyB0aGF0IHRoaXMgdHJhaW4gdXN1YWxseSBzZXJ2ZXMsIGJ1dCBjdXJyZW50bHkgaXNuJ3RcclxuICAgICAgICBsZXQgc2xOb3RTdG9wcGluZyA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDgsXHJcbiAgICAgICAgICAgIFsuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXNdXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGFrZSBhIHJhbmRvbSBzbGljZSBmcm9tIHRoZSBjYWxsaW5nIGxpc3QsIHRvIGlkZW50aWZ5IGFzIHJlcXVlc3Qgc3RvcHNcclxuICAgICAgICBsZXQgcmVxQ291bnQgICA9IFJhbmRvbS5pbnQoMSwgc2xDYWxsaW5nLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGxldCBzbFJlcXVlc3RzID0gc2xDYWxsaW5nLnNsaWNlKDAsIHJlcUNvdW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZycsICAgICAgIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZ19zcGxpdCcsIHNsQ2FsbFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjaGFuZ2VzJywgICAgICAgc2xDaGFuZ2VzKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdub3Rfc3RvcHBpbmcnLCAgc2xOb3RTdG9wcGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgncmVxdWVzdCcsICAgICAgIHNsUmVxdWVzdHMpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDIuIFByZXBvcHVsYXRlIHN0YXRpb25zXHJcblxyXG4gICAgICAgIC8vIEFueSBzdGF0aW9uIG1heSBiZSBibGFtZWQgZm9yIGFuIGV4Y3VzZSwgZXZlbiBvbmVzIGFscmVhZHkgcGlja2VkXHJcbiAgICAgICAgbGV0IHN0RXhjdXNlICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiBpcyBmaW5hbCBjYWxsIG9mIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0ICAgID0gc2xDYWxsaW5nW3NsQ2FsbGluZy5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBWaWEgaXMgYSBjYWxsIGJlZm9yZSB0aGUgZGVzdGluYXRpb24sIG9yIG9uZSBpbiB0aGUgc3BsaXQgbGlzdCBpZiB0b28gc21hbGxcclxuICAgICAgICBsZXQgc3RWaWEgICAgID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBEaXR0byBmb3IgcGlja2luZyBhIHJhbmRvbSBjYWxsaW5nIHN0YXRpb24gYXMgYSBzaW5nbGUgcmVxdWVzdCBvciBjaGFuZ2Ugc3RvcFxyXG4gICAgICAgIGxldCBzdENhbGxpbmcgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG5cclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiAobGFzdCBjYWxsKSBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3RTcGxpdCA9IHNsQ2FsbFNwbGl0W3NsQ2FsbFNwbGl0Lmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFJhbmRvbSBub24tZGVzdGluYXRpb24gc3RvcCBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdFZpYVNwbGl0ICA9IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gV2hlcmUgdGhlIHRyYWluIGNvbWVzIGZyb20sIHNvIGNhbid0IGJlIG9uIGFueSBsaXN0cyBvciBwcmlvciBzdGF0aW9uc1xyXG4gICAgICAgIGxldCBzdFNvdXJjZSAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoW1xyXG4gICAgICAgICAgICAuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXMsIC4uLnNsTm90U3RvcHBpbmcsIC4uLnNsUmVxdWVzdHMsXHJcbiAgICAgICAgICAgIHN0Q2FsbGluZywgc3REZXN0LCBzdFZpYSwgc3REZXN0U3BsaXQsIHN0VmlhU3BsaXRcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdjYWxsaW5nJywgICAgICAgICAgIHN0Q2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbicsICAgICAgIHN0RGVzdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbl9zcGxpdCcsIHN0RGVzdFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2V4Y3VzZScsICAgICAgICAgICAgc3RFeGN1c2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignc291cmNlJywgICAgICAgICAgICBzdFNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWEnLCAgICAgICAgICAgICAgIHN0VmlhKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYV9zcGxpdCcsICAgICAgICAgc3RWaWFTcGxpdCk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMy4gUHJlcG9wdWxhdGUgY29hY2ggbnVtYmVyc1xyXG5cclxuICAgICAgICBsZXQgaW50Q29hY2hlcyA9IHRoaXMuZ2V0SW50ZWdlcignY29hY2hlcycpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGp1c3Qgc3BsaXQgdGhlIG51bWJlciBkb3duIHRoZSBtaWRkbGUgaW5zdGVhZC5cclxuICAgICAgICAvLyBFbHNlLCBmcm9udCBhbmQgcmVhciBjb2FjaGVzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGludEZyb250Q29hY2hlcyA9IChpbnRDb2FjaGVzIC8gMikgfCAwO1xyXG4gICAgICAgICAgICBsZXQgaW50UmVhckNvYWNoZXMgID0gaW50Q29hY2hlcyAtIGludEZyb250Q29hY2hlcztcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcignZnJvbnRfY29hY2hlcycsIGludEZyb250Q29hY2hlcyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcigncmVhcl9jb2FjaGVzJywgaW50UmVhckNvYWNoZXMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBhc3NpZ24gY29hY2ggbGV0dGVycyBmb3IgY29udGV4dHMuXHJcbiAgICAgICAgLy8gRWxzZSwgbGV0dGVycyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsZXR0ZXJzID0gTC5MRVRURVJTLnNsaWNlKDAsIGludENvYWNoZXMpLnNwbGl0KCcnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdmaXJzdCcsICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3Nob3AnLCAgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQxJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDInLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNC4gUHJlcG9wdWxhdGUgc2VydmljZXNcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBzZXJ2aWNlLCBwaWNrIG9uZSB0byBiZSB0aGUgXCJtYWluXCIgYW5kIG9uZSB0byBiZSB0aGVcclxuICAgICAgICAvLyBcImFsdGVybmF0ZVwiLCBlbHNlIHRoZSBvbmUgc2VydmljZSB3aWxsIGJlIHVzZWQgZm9yIGJvdGggKHdpdGhvdXQgbWFraW5nIHNlbnNlKS5cclxuICAgICAgICBpZiAoUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmxlbmd0aCA+IDEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgc2VydmljZXMgPSBSQUcuZGF0YWJhc2Uuc2VydmljZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ3Byb3ZpZGVyJywgICAgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdhbHRlcm5hdGl2ZScsIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNS4gUHJlcG9wdWxhdGUgdGltZXNcclxuICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTIxNDc1M1xyXG5cclxuICAgICAgICAvLyBUaGUgYWx0ZXJuYXRpdmUgdGltZSBpcyBmb3IgYSB0cmFpbiB0aGF0J3MgbGF0ZXIgdGhhbiB0aGUgbWFpbiB0cmFpblxyXG4gICAgICAgIGxldCB0aW1lICAgID0gbmV3IERhdGUoIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgUmFuZG9tLmludCgwLCA1OSkgKiA2MDAwMCk7XHJcbiAgICAgICAgbGV0IHRpbWVBbHQgPSBuZXcgRGF0ZSggdGltZS5nZXRUaW1lKCkgICAgICAgKyBSYW5kb20uaW50KDAsIDMwKSAqIDYwMDAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnbWFpbicsICAgICAgICBTdHJpbmdzLmZyb21UaW1lKHRpbWUpICAgICk7XHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnYWx0ZXJuYXRpdmUnLCBTdHJpbmdzLmZyb21UaW1lKHRpbWVBbHQpICk7XHJcbiAgICB9XHJcbn0iXX0=