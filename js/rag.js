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
            // Watchdog: generous enough not to cut real speech short
            // (~90ms/char, clamped to 6s..60s), but bounded so a hung engine
            // can never stall the scenario.
            let watchdogMs = Math.min(60000, Math.max(6000, text.length * 90));
            clearTimeout(this.watchdog);
            this.watchdog = window.setTimeout(() => {
                this.finishStep(step.gapMs);
            }, watchdogMs);
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
        // Begin
        RAG.views.disclaimer.disclaim();
        RAG.views.marquee.set(L.WELCOME);
        RAG.generate();
        // Ping dashboard if open
        RAG.channel.send('PONG', { stateJson: JSON.stringify(RAG.state) });
        // Determine this page's role. The dashboard role (index.html) is the
        // terminal: build / manage / run scenarios and edit steps in its
        // in-page editor. The screen role (screen.html) is a marquee-only
        // display that mirrors playback over the channel.
        if (RAG.isDashboardRole())
            RAG.dashboard.open();
        else if (RAG.isScreenRole())
            RAG.setupDisplayRole();
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
     * the phrase editor so only the scrolling board is visible; playback is
     * driven over the channel (PLAY_* / WAIT_COUNTDOWN / STOP_PLAYBACK) and
     * never speaks here, so the voice is not doubled.
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL2NvbGxhcHNlVG9nZ2xlLnRzIiwidWkvY29udHJvbHMvcGhyYXNlc2V0QnV0dG9uLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkNob29zZXIudHMiLCJ1aS9jb250cm9scy9zdGF0aW9uTGlzdEl0ZW0udHMiLCJ1aS9waWNrZXJzL3BpY2tlci50cyIsInVpL3BpY2tlcnMvY29hY2hQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2V4Y3VzZVBpY2tlci50cyIsInVpL3BpY2tlcnMvaW50ZWdlclBpY2tlci50cyIsInVpL3BpY2tlcnMvbmFtZWRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BocmFzZXNldFBpY2tlci50cyIsInVpL3BpY2tlcnMvcGxhdGZvcm1QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3NlcnZpY2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25MaXN0UGlja2VyLnRzIiwidWkvcGlja2Vycy90aW1lUGlja2VyLnRzIiwiY29uZmlnL2NvbmZpZ0Jhc2UudHMiLCJjb25maWcvY29uZmlnLnRzIiwiZGFzaGJvYXJkL2Rhc2hib2FyZC50cyIsImxhbmcvZW5nbGlzaExhbmd1YWdlLnRzIiwicGhyYXNlci9lbGVtZW50UHJvY2Vzc29ycy50cyIsInBocmFzZXIvcGhyYXNlQ29udGV4dC50cyIsInBocmFzZXIvcGhyYXNlci50cyIsInNjZW5hcmlvL3NjZW5hcmlvLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL3ZpZXdCYXNlLnRzIiwidWkvZGlzY2xhaW1lci50cyIsInVpL2VkaXRvci50cyIsInVpL21hcnF1ZWUudHMiLCJ1aS9zZXR0aW5ncy50cyIsInVpL3Rvb2xiYXIudHMiLCJ1aS92aWV3cy50cyIsInV0aWwvYXNzZXJ0cy50cyIsInV0aWwvY29sbGFwc2libGVzLnRzIiwidXRpbC9jb25kaXRpb25hbHMudHMiLCJ1dGlsL2RvbS50cyIsInV0aWwvbGlua2Rvd24udHMiLCJ1dGlsL3BhcnNlLnRzIiwidXRpbC9yYW5kb20udHMiLCJ1dGlsL3NvdW5kcy50cyIsInV0aWwvc3RyaW5ncy50cyIsInV0aWwvdHlwZXMudHMiLCJjaGFubmVsLnRzIiwiZGF0YWJhc2UudHMiLCJyYWcudHMiLCJzdGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSxzRUFBc0U7QUFFdEUsOERBQThEO0FBQzlELElBQUksQ0FBbUIsQ0FBQztBQUV4QixNQUFNLElBQUk7SUFVTiw0RUFBNEU7SUFDckUsTUFBTSxDQUFDLElBQUk7UUFFZCxJQUFJLElBQUksQ0FBQyxTQUFTO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBRW5ELElBQUksQ0FBQyxTQUFTLEdBQUc7WUFDYixJQUFJLEVBQUcsSUFBSSxlQUFlLEVBQUU7U0FDL0IsQ0FBQztRQUVGLDJCQUEyQjtRQUMzQixDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTVDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLE1BQU0sQ0FBQyxVQUFVO1FBRXJCLElBQUksSUFBa0IsQ0FBQztRQUN2QixJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsZ0JBQWdCLENBQ2hDLFFBQVEsQ0FBQyxJQUFJLEVBQ2IsVUFBVSxDQUFDLFlBQVksR0FBRyxVQUFVLENBQUMsU0FBUyxFQUM5QyxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQy9CLEtBQUssQ0FDUixDQUFD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QUMvRCxJQUFJLENBQUMsVUFBVSxDQUFFLGFBQWEsRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFFLENBQUM7U0FDbEU7UUFFRCw0QkFBNEI7UUFDNUIsc0NBQXNDO1FBRXRDLHVFQUF1RTtRQUN2RSxJQUFJLElBQUksR0FBTSxJQUFJLElBQUksQ0FBRSxJQUFJLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDO1FBQzFFLElBQUksT0FBTyxHQUFHLElBQUksSUFBSSxDQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBUyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztRQUUxRSxJQUFJLENBQUMsT0FBTyxDQUFFLE1BQU0sRUFBUyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFLLENBQUM7UUFDekQsSUFBSSxDQUFDLE9BQU8sQ0FBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBRSxDQUFDO0lBQzdELENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBHbG9iYWwgcmVmZXJlbmNlIHRvIHRoZSBsYW5ndWFnZSBjb250YWluZXIsIHNldCBhdCBpbml0ICovXHJcbmxldCBMIDogRW5nbGlzaExhbmd1YWdlO1xyXG5cclxuY2xhc3MgSTE4blxyXG57XHJcbiAgICAvKiogQ29uc3RhbnQgcmVnZXggdG8gbWF0Y2ggZm9yIHRyYW5zbGF0aW9uIGtleXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRBR19SRUdFWCA6IFJlZ0V4cCA9IC8lW0EtWl9dKyUvO1xyXG5cclxuICAgIC8qKiBMYW5ndWFnZXMgY3VycmVudGx5IGF2YWlsYWJsZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbGFuZ3VhZ2VzICAgOiBEaWN0aW9uYXJ5PEVuZ2xpc2hMYW5ndWFnZT47XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIGxhbmd1YWdlIGN1cnJlbnRseSBpbiB1c2UgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGN1cnJlbnRMYW5nIDogRW5nbGlzaExhbmd1YWdlO1xyXG5cclxuICAgIC8qKiBQaWNrcyBhIGxhbmd1YWdlLCBhbmQgdHJhbnNmb3JtcyBhbGwgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZG9jdW1lbnQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmxhbmd1YWdlcylcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJMThuIGlzIGFscmVhZHkgaW5pdGlhbGl6ZWQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5sYW5ndWFnZXMgPSB7XHJcbiAgICAgICAgICAgICdlbicgOiBuZXcgRW5nbGlzaExhbmd1YWdlKClcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBMYW5ndWFnZSBzZWxlY3Rpb25cclxuICAgICAgICBMID0gdGhpcy5jdXJyZW50TGFuZyA9IHRoaXMubGFuZ3VhZ2VzWydlbiddO1xyXG5cclxuICAgICAgICBJMThuLmFwcGx5VG9Eb20oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFdhbGtzIHRocm91Z2ggYWxsIHRleHQgbm9kZXMgaW4gdGhlIERPTSwgcmVwbGFjaW5nIGFueSB0cmFuc2xhdGlvbiBrZXlzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzEwNzMwNzc3LzMzNTQ5MjBcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgYXBwbHlUb0RvbSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXh0IDogTm9kZSB8IG51bGw7XHJcbiAgICAgICAgbGV0IHdhbGsgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKFxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LFxyXG4gICAgICAgICAgICBOb2RlRmlsdGVyLlNIT1dfRUxFTUVOVCB8IE5vZGVGaWx0ZXIuU0hPV19URVhULFxyXG4gICAgICAgICAgICB7IGFjY2VwdE5vZGU6IEkxOG4ubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggbmV4dCA9IHdhbGsubmV4dE5vZGUoKSApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAobmV4dC5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50ID0gbmV4dCBhcyBFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5hdHRyaWJ1dGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICAgICAgICAgIEkxOG4uZXhwYW5kQXR0cmlidXRlKGVsZW1lbnQuYXR0cmlidXRlc1tpXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZiAobmV4dC5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUgJiYgbmV4dC50ZXh0Q29udGVudClcclxuICAgICAgICAgICAgICAgIEkxOG4uZXhwYW5kVGV4dE5vZGUobmV4dCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWx0ZXJzIHRoZSB0cmVlIHdhbGtlciB0byBleGNsdWRlIHNjcmlwdCBhbmQgc3R5bGUgdGFncyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbm9kZUZpbHRlcihub2RlOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YWcgPSAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAgICAgID8gKG5vZGUgYXMgRWxlbWVudCkudGFnTmFtZS50b1VwcGVyQ2FzZSgpXHJcbiAgICAgICAgICAgIDogbm9kZS5wYXJlbnRFbGVtZW50IS50YWdOYW1lLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbJ1NDUklQVCcsICdTVFlMRSddLmluY2x1ZGVzKHRhZylcclxuICAgICAgICAgICAgPyBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1RcclxuICAgICAgICAgICAgOiBOb2RlRmlsdGVyLkZJTFRFUl9BQ0NFUFQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEV4cGFuZHMgYW55IHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGdpdmVuIGF0dHJpYnV0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZXhwYW5kQXR0cmlidXRlKGF0dHI6IEF0dHIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNldHRpbmcgYW4gYXR0cmlidXRlLCBldmVuIGlmIG5vdGhpbmcgYWN0dWFsbHkgY2hhbmdlcywgd2lsbCBjYXVzZSB2YXJpb3VzXHJcbiAgICAgICAgLy8gc2lkZS1lZmZlY3RzIChlLmcuIHJlbG9hZGluZyBpZnJhbWVzKS4gU28sIGFzIHdhc3RlZnVsIGFzIHRoaXMgbG9va3MsIHdlIGhhdmVcclxuICAgICAgICAvLyB0byBtYXRjaCBmaXJzdCBiZWZvcmUgYWN0dWFsbHkgcmVwbGFjaW5nLlxyXG5cclxuICAgICAgICBpZiAoIGF0dHIudmFsdWUubWF0Y2godGhpcy5UQUdfUkVHRVgpIClcclxuICAgICAgICAgICAgYXR0ci52YWx1ZSA9IGF0dHIudmFsdWUucmVwbGFjZSh0aGlzLlRBR19SRUdFWCwgSTE4bi5yZXBsYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRXhwYW5kcyBhbnkgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZ2l2ZW4gdGV4dCBub2RlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBleHBhbmRUZXh0Tm9kZShub2RlOiBOb2RlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBub2RlLnRleHRDb250ZW50ID0gbm9kZS50ZXh0Q29udGVudCEucmVwbGFjZSh0aGlzLlRBR19SRUdFWCwgSTE4bi5yZXBsYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVwbGFjZXMga2V5IHdpdGggdmFsdWUgaWYgaXQgZXhpc3RzLCBlbHNlIGtlZXBzIHRoZSBrZXkgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlcGxhY2UobWF0Y2g6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ICAgPSBtYXRjaC5zbGljZSgxLCAtMSk7XHJcbiAgICAgICAgbGV0IHZhbHVlID0gTFtrZXldIGFzIExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgICAgIGlmICghdmFsdWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdNaXNzaW5nIHRyYW5zbGF0aW9uIGtleTonLCBtYXRjaCk7XHJcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSByZXR1cm4gKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJylcclxuICAgICAgICAgICAgPyB2YWx1ZSgpXHJcbiAgICAgICAgICAgIDogdmFsdWU7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGVsZWdhdGUgdHlwZSBmb3IgY2hvb3NlciBzZWxlY3QgZXZlbnQgaGFuZGxlcnMgKi9cclxudHlwZSBTZWxlY3REZWxlZ2F0ZSA9IChlbnRyeTogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4vKiogVUkgZWxlbWVudCB3aXRoIGEgZmlsdGVyYWJsZSBhbmQga2V5Ym9hcmQgbmF2aWdhYmxlIGxpc3Qgb2YgY2hvaWNlcyAqL1xyXG5jbGFzcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggY2hvb3NlciBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI2Nob29zZXJUZW1wbGF0ZScpO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgY29udGFpbmVyICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZG9tICAgICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGZpbHRlciBpbnB1dCBib3ggKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnB1dEZpbHRlciAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgb2YgaXRlbSBlbGVtZW50cyAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0Q2hvaWNlcyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBPcHRpb25hbCBldmVudCBoYW5kbGVyIHRvIGZpcmUgd2hlbiBhbiBpdGVtIGlzIHNlbGVjdGVkIGJ5IHRoZSB1c2VyICovXHJcbiAgICBwdWJsaWMgICAgb25TZWxlY3Q/ICAgICA6IFNlbGVjdERlbGVnYXRlO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gdmlzdWFsbHkgc2VsZWN0IHRoZSBjbGlja2VkIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyAgICBzZWxlY3RPbkNsaWNrIDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgaXRlbSwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZG9tU2VsZWN0ZWQ/ICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgYXV0by1maWx0ZXIgdGltZW91dCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZmlsdGVyVGltZW91dCA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogV2hldGhlciB0byBncm91cCBhZGRlZCBlbGVtZW50cyBieSBhbHBoYWJldGljYWwgc2VjdGlvbnMgKi9cclxuICAgIHByb3RlY3RlZCBncm91cEJ5QUJDICAgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFRpdGxlIGF0dHJpYnV0ZSB0byBhcHBseSB0byBldmVyeSBpdGVtIGFkZGVkICovXHJcbiAgICBwcm90ZWN0ZWQgaXRlbVRpdGxlICAgICA6IHN0cmluZyA9ICdDbGljayB0byBzZWxlY3QgdGhpcyBpdGVtJztcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhIGNob29zZXIsIGJ5IHJlcGxhY2luZyB0aGUgcGxhY2Vob2xkZXIgaW4gYSBnaXZlbiBwYXJlbnQgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIGlmICghQ2hvb3Nlci5URU1QTEFURSlcclxuICAgICAgICAgICAgQ2hvb3Nlci5pbml0KCk7XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXQgICAgICA9IERPTS5yZXF1aXJlKCdjaG9vc2VyJywgcGFyZW50KTtcclxuICAgICAgICBsZXQgcGxhY2Vob2xkZXIgPSBET00uZ2V0QXR0cih0YXJnZXQsICdwbGFjZWhvbGRlcicsIEwuUF9HRU5FUklDX1BIKTtcclxuICAgICAgICBsZXQgdGl0bGUgICAgICAgPSBET00uZ2V0QXR0cih0YXJnZXQsICd0aXRsZScsIEwuUF9HRU5FUklDX1QpO1xyXG4gICAgICAgIHRoaXMuaXRlbVRpdGxlICA9IERPTS5nZXRBdHRyKHRhcmdldCwgJ2l0ZW1UaXRsZScsIHRoaXMuaXRlbVRpdGxlKTtcclxuICAgICAgICB0aGlzLmdyb3VwQnlBQkMgPSB0YXJnZXQuaGFzQXR0cmlidXRlKCdncm91cEJ5QUJDJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgID0gQ2hvb3Nlci5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlciAgPSBET00ucmVxdWlyZSgnLmNoU2VhcmNoQm94JywgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcyA9IERPTS5yZXF1aXJlKCcuY2hDaG9pY2VzQm94JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy50aXRsZSAgICAgID0gdGl0bGU7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xyXG4gICAgICAgIC8vIFRPRE86IFJldXNpbmcgdGhlIHBsYWNlaG9sZGVyIGFzIHRpdGxlIGlzIHByb2JhYmx5IGJhZFxyXG4gICAgICAgIC8vIGh0dHBzOi8vbGFrZW4ubmV0L2Jsb2cvbW9zdC1jb21tb24tYTExeS1taXN0YWtlcy9cclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnRpdGxlICAgICAgID0gcGxhY2Vob2xkZXI7XHJcblxyXG4gICAgICAgIHRhcmdldC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2JlZm9yZWJlZ2luJywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRhcmdldC5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIHZhbHVlIHRvIHRoZSBjaG9vc2VyIGFzIGEgc2VsZWN0YWJsZSBpdGVtLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBUZXh0IG9mIHRoZSBzZWxlY3RhYmxlIGl0ZW1cclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZCh2YWx1ZTogc3RyaW5nLCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG5cclxuICAgICAgICBpdGVtLmlubmVyVGV4dCA9IHZhbHVlO1xyXG5cclxuICAgICAgICB0aGlzLmFkZFJhdyhpdGVtLCBzZWxlY3QpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkcyB0aGUgZ2l2ZW4gZWxlbWVudCB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaXRlbSBFbGVtZW50IHRvIGFkZCB0byB0aGUgY2hvb3NlclxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBXaGV0aGVyIHRvIHNlbGVjdCB0aGlzIGl0ZW0gb25jZSBhZGRlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWRkUmF3KGl0ZW06IEhUTUxFbGVtZW50LCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaXRlbS50aXRsZSAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgICAgIGl0ZW0udGFiSW5kZXggPSAtMTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoaXRlbSk7XHJcblxyXG4gICAgICAgIGlmIChzZWxlY3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgaXRlbS5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYXJzIGFsbCBpdGVtcyBmcm9tIHRoaXMgY2hvb3NlciBhbmQgdGhlIGN1cnJlbnQgZmlsdGVyICovXHJcbiAgICBwdWJsaWMgY2xlYXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnZhbHVlICAgICAgPSAnJztcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2VsZWN0IGFuZCBmb2N1cyB0aGUgZW50cnkgdGhhdCBtYXRjaGVzIHRoZSBnaXZlbiB2YWx1ZSAqL1xyXG4gICAgcHVibGljIHByZXNlbGVjdCh2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBrZXkgaW4gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW4pXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaXRlbSA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuW2tleV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IGl0ZW0uaW5uZXJUZXh0KVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsaWNrIGV2ZW50cywgZm9yIGNob29zaW5nIGl0ZW1zICovXHJcbiAgICBwdWJsaWMgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKHRhcmdldCkgKVxyXG4gICAgICAgIGlmICggIXRhcmdldC5oYXNBdHRyaWJ1dGUoJ2Rpc2FibGVkJykgKVxyXG4gICAgICAgICAgICB0aGlzLnNlbGVjdCh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsb3NlIG1ldGhvZHMsIGRvaW5nIGFueSB0aW1lciBjbGVhbnVwICovXHJcbiAgICBwdWJsaWMgb25DbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBpbnB1dCBldmVudHMsIGZvciBmaWx0ZXJpbmcgYW5kIG5hdmlnYXRpb24gKi9cclxuICAgIHB1YmxpYyBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmb2N1c2VkLnBhcmVudEVsZW1lbnQhO1xyXG5cclxuICAgICAgICBpZiAoIWZvY3VzZWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gT25seSBoYW5kbGUgZXZlbnRzIG9uIHRoaXMgY2hvb3NlcidzIGNvbnRyb2xzXHJcbiAgICAgICAgaWYgKCAhdGhpcy5vd25zKGZvY3VzZWQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgdHlwaW5nIGludG8gZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkID09PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoXyA9PiB0aGlzLmZpbHRlcigpLCA1MDApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZWRpcmVjdCB0eXBpbmcgdG8gaW5wdXQgZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkICE9PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIGlmIChrZXkubGVuZ3RoID09PSAxIHx8IGtleSA9PT0gJ0JhY2tzcGFjZScpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlucHV0RmlsdGVyLmZvY3VzKCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwcmVzc2luZyBFTlRFUiBhZnRlciBrZXlib2FyZCBuYXZpZ2F0aW5nIHRvIGFuIGl0ZW1cclxuICAgICAgICBpZiAoIHRoaXMuaXNDaG9pY2UoZm9jdXNlZCkgKVxyXG4gICAgICAgIGlmIChrZXkgPT09ICdFbnRlcicpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdChmb2N1c2VkKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIG5hdmlnYXRpb24gd2hlbiBjb250YWluZXIgb3IgaXRlbSBpcyBmb2N1c2VkXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIGlmIHVzaW5nIGdyb3Vwc1xyXG4gICAgICAgICAgICBpZiAgICAgICggdGhpcy5ncm91cEJ5QUJDICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2dyb3VwJykgKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiBjaG9pY2VzIGFyZSBmbGF0XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCF0aGlzLmdyb3VwQnlBQkMgJiYgZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0Q2hvaWNlcylcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnRcclxuICAgICAgICAgICAgZWxzZSBpZiAoZm9jdXNlZCA9PT0gdGhpcy5kb21TZWxlY3RlZClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyh0aGlzLmRvbVNlbGVjdGVkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIHN1Ym1pdCBldmVudHMsIGZvciBpbnN0YW50IGZpbHRlcmluZyAqL1xyXG4gICAgcHVibGljIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB0aGlzLmZpbHRlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIaWRlIG9yIHNob3cgY2hvaWNlcyBpZiB0aGV5IHBhcnRpYWxseSBtYXRjaCB0aGUgdXNlciBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGZpbHRlcigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgbGV0IGZpbHRlciA9IHRoaXMuaW5wdXRGaWx0ZXIudmFsdWUudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBsZXQgaXRlbXMgID0gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW47XHJcbiAgICAgICAgbGV0IGVuZ2luZSA9IHRoaXMuZ3JvdXBCeUFCQ1xyXG4gICAgICAgICAgICA/IENob29zZXIuZmlsdGVyR3JvdXBcclxuICAgICAgICAgICAgOiBDaG9vc2VyLmZpbHRlckl0ZW07XHJcblxyXG4gICAgICAgIC8vIFByZXZlbnQgYnJvd3NlciByZWRyYXcvcmVmbG93IGR1cmluZyBmaWx0ZXJpbmdcclxuICAgICAgICAvLyBUT0RPOiBNaWdodCB0aGUgdXNlIG9mIGhpZGRlbiBicmVhayBBMTF5IGhlcmU/IChlLmcuIGRlZm9jdXMpXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaGlkZGVuID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGFsbCB0aGUgaXRlbXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBlbmdpbmUoaXRlbXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBcHBsaWVzIGZpbHRlciB0byBhbiBpdGVtLCBzaG93aW5nIGl0IGlmIG1hdGNoZWQsIGhpZGluZyBpZiBub3QgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVySXRlbShpdGVtOiBIVE1MRWxlbWVudCwgZmlsdGVyOiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2hvdyBpZiBjb250YWlucyBzZWFyY2ggdGVybVxyXG4gICAgICAgIGlmIChpdGVtLmlubmVyVGV4dC50b0xvd2VyQ2FzZSgpLmluZGV4T2YoZmlsdGVyKSA+PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaXRlbS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIaWRlIGlmIG5vdFxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICAgICAgcmV0dXJuIDE7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBcHBsaWVzIGZpbHRlciB0byBjaGlsZHJlbiBvZiBhIGdyb3VwLCBoaWRpbmcgdGhlIGdyb3VwIGlmIGFsbCBjaGlsZHJlbiBoaWRlICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGZpbHRlckdyb3VwKGdyb3VwOiBIVE1MRWxlbWVudCwgZmlsdGVyOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyaWVzID0gZ3JvdXAuY2hpbGRyZW47XHJcbiAgICAgICAgbGV0IGNvdW50ICAgPSBlbnRyaWVzLmxlbmd0aCAtIDE7IC8vIC0xIGZvciBoZWFkZXIgZWxlbWVudFxyXG4gICAgICAgIGxldCBoaWRkZW4gID0gMDtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggc3RhdGlvbiBuYW1lIGluIHRoaXMgbGV0dGVyIHNlY3Rpb24uIEhlYWRlciBza2lwcGVkLlxyXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgZW50cmllcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgaGlkZGVuICs9IENob29zZXIuZmlsdGVySXRlbShlbnRyaWVzW2ldIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICAvLyBJZiBhbGwgc3RhdGlvbiBuYW1lcyBpbiB0aGlzIGxldHRlciBzZWN0aW9uIHdlcmUgaGlkZGVuLCBoaWRlIHRoZSBzZWN0aW9uXHJcbiAgICAgICAgaWYgKGhpZGRlbiA+PSBjb3VudClcclxuICAgICAgICAgICAgZ3JvdXAuaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIGdyb3VwLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgYW5kIHVwZGF0ZXMgdGhlIHN0YXRlIGFuZCBlZGl0b3IgKi9cclxuICAgIHByb3RlY3RlZCBzZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgYWxyZWFkeVNlbGVjdGVkID0gKGVudHJ5ID09PSB0aGlzLmRvbVNlbGVjdGVkKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0T25DbGljaylcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5vblNlbGVjdClcclxuICAgICAgICAgICAgdGhpcy5vblNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmIChhbHJlYWR5U2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgY2hhbmdlcyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQgKi9cclxuICAgIHByb3RlY3RlZCB2aXN1YWxTZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSBlbnRyeTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnRhYkluZGV4ID0gNTA7XHJcbiAgICAgICAgZW50cnkuc2V0QXR0cmlidXRlKCdzZWxlY3RlZCcsICd0cnVlJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IHVuc2VsZWN0cyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQsIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFVuc2VsZWN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbVNlbGVjdGVkKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQucmVtb3ZlQXR0cmlidXRlKCdzZWxlY3RlZCcpO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSAtMTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkICAgICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2hldGhlciB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3IgKG93bmVyKSBvZiB0aGUgZ2l2ZW4gZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gY2hlY2sgaWYgdGhpcyBjaG9vc2VyIGlzIGFuIGFuY2VzdG9yIG9mXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvd25zKHRhcmdldDogSFRNTEVsZW1lbnQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBnaXZlbiBlbGVtZW50IGlzIGEgY2hvb3NhYmxlIG9uZSBvd25lZCBieSB0aGlzIGNob29zZXIgKi9cclxuICAgIHByb3RlY3RlZCBpc0Nob2ljZSh0YXJnZXQ/OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRhcmdldCAhPT0gdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICYmIHRhcmdldC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdkZCdcclxuICAgICAgICAgICAgJiYgdGhpcy5vd25zKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVUkgZWxlbWVudCBmb3IgdG9nZ2xpbmcgdGhlIHN0YXRlIG9mIGNvbGxhcHNpYmxlIGVkaXRvciBlbGVtZW50cyAqL1xyXG5jbGFzcyBDb2xsYXBzZVRvZ2dsZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB0b2dnbGUgYnV0dG9uIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjY29sbGFwc2libGVCdXR0b25UZW1wbGF0ZScpO1xyXG4gICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFLmlkICAgICA9ICcnO1xyXG4gICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBhdHRhY2hlcyB0b2dnbGUgZWxlbWVudCBmb3IgdG9nZ2xpbmcgY29sbGFwc2libGVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNyZWF0ZUFuZEF0dGFjaChwYXJlbnQ6IEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNraXAgaWYgYSB0b2dnbGUgaXMgYWxyZWFkeSBhdHRhY2hlZFxyXG4gICAgICAgIGlmICggcGFyZW50LnF1ZXJ5U2VsZWN0b3IoJy50b2dnbGUnKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKCFDb2xsYXBzZVRvZ2dsZS5URU1QTEFURSlcclxuICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUuaW5pdCgpO1xyXG5cclxuICAgICAgICBwYXJlbnQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmJlZ2luJyxcclxuICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEVsZW1lbnRcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBnaXZlbiBjb2xsYXBzZSB0b2dnbGUncyB0aXRsZSB0ZXh0LCBkZXBlbmRpbmcgb24gc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdXBkYXRlKHNwYW46IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVmICAgID0gc3Bhbi5kYXRhc2V0WydyZWYnXSB8fCAnPz8/JztcclxuICAgICAgICBsZXQgdHlwZSAgID0gc3Bhbi5kYXRhc2V0Wyd0eXBlJ10hO1xyXG4gICAgICAgIGxldCBzdGF0ZSAgPSBzcGFuLmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcbiAgICAgICAgbGV0IHRvZ2dsZSA9IERPTS5yZXF1aXJlKCcudG9nZ2xlJywgc3Bhbik7XHJcblxyXG4gICAgICAgIHRvZ2dsZS50aXRsZSA9IHN0YXRlXHJcbiAgICAgICAgICAgID8gTC5USVRMRV9PUFRfT1BFTih0eXBlLCByZWYpXHJcbiAgICAgICAgICAgIDogTC5USVRMRV9PUFRfQ0xPU0UodHlwZSwgcmVmKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVSSBlbGVtZW50IGZvciBvcGVuaW5nIHRoZSBwaWNrZXIgZm9yIHBocmFzZXNldCBlZGl0b3IgZWxlbWVudHMgKi9cclxuY2xhc3MgUGhyYXNlc2V0QnV0dG9uXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBocmFzZXNldCBidXR0b24gRE9NIHRlbXBsYXRlIHRvIGNsb25lICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogVGhpcyBpcyBiZWluZyBkdXBsaWNhdGVkIGluIHZhcmlvdXMgcGxhY2VzOyBEUlkgd2l0aCBzdWdhciBtZXRob2RcclxuICAgICAgICBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNwaHJhc2VzZXRCdXR0b25UZW1wbGF0ZScpO1xyXG4gICAgICAgIFBocmFzZXNldEJ1dHRvbi5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBhdHRhY2hlcyBhIGJ1dHRvbiBmb3IgdGhlIGdpdmVuIHBocmFzZXNldCBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNyZWF0ZUFuZEF0dGFjaChwaHJhc2VzZXQ6IEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNraXAgaWYgYSBidXR0b24gaXMgYWxyZWFkeSBhdHRhY2hlZFxyXG4gICAgICAgIGlmICggcGhyYXNlc2V0LnF1ZXJ5U2VsZWN0b3IoJy5jaG9vc2VQaHJhc2UnKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKCFQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUpXHJcbiAgICAgICAgICAgIFBocmFzZXNldEJ1dHRvbi5pbml0KCk7XHJcblxyXG4gICAgICAgIGxldCByZWYgICAgICA9IERPTS5yZXF1aXJlRGF0YShwaHJhc2VzZXQgYXMgSFRNTEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgYnV0dG9uICAgPSBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGJ1dHRvbi50aXRsZSA9IEwuVElUTEVfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIHBocmFzZXNldC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2FmdGVyYmVnaW4nLCBidXR0b24pO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwiY2hvb3Nlci50c1wiLz5cclxuXHJcbi8vIFRPRE86IFNlYXJjaCBieSBzdGF0aW9uIGNvZGVcclxuXHJcbi8qKlxyXG4gKiBTaW5nbGV0b24gaW5zdGFuY2Ugb2YgdGhlIHN0YXRpb24gcGlja2VyLiBTaW5jZSB0aGVyZSBhcmUgZXhwZWN0ZWQgdG8gYmUgMjUwMCtcclxuICogc3RhdGlvbnMsIHRoaXMgZWxlbWVudCB3b3VsZCB0YWtlIHVwIGEgbG90IG9mIG1lbW9yeSBhbmQgZ2VuZXJhdGUgYSBsb3Qgb2YgRE9NLiBTbywgaXRcclxuICogaGFzIHRvIGJlIFwic3dhcHBlZFwiIGJldHdlZW4gcGlja2VycyBhbmQgdmlld3MgdGhhdCB3YW50IHRvIHVzZSBpdC5cclxuICovXHJcbmNsYXNzIFN0YXRpb25DaG9vc2VyIGV4dGVuZHMgQ2hvb3NlclxyXG57XHJcbiAgICAvKiogU2hvcnRjdXQgcmVmZXJlbmNlcyB0byBhbGwgdGhlIGdlbmVyYXRlZCBBLVogc3RhdGlvbiBsaXN0IGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVN0YXRpb25zIDogRGljdGlvbmFyeTxIVE1MRExpc3RFbGVtZW50PiA9IHt9O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHBhcmVudCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnRhYkluZGV4ID0gMDtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGVzIHRoZSBsaXN0IG9mIHN0YXRpb25zIGZyb20gdGhlIGRhdGFiYXNlLiBXZSBkbyB0aGlzIGJ5IGNyZWF0aW5nIGEgZGxcclxuICAgICAgICAvLyBlbGVtZW50IGZvciBlYWNoIGxldHRlciBvZiB0aGUgYWxwaGFiZXQsIGNyZWF0aW5nIGEgZHQgZWxlbWVudCBoZWFkZXIsIGFuZCB0aGVuXHJcbiAgICAgICAgLy8gcG9wdWxhdGluZyB0aGUgZGwgd2l0aCBzdGF0aW9uIG5hbWUgZGQgY2hpbGRyZW4uXHJcbiAgICAgICAgT2JqZWN0LmtleXMoUkFHLmRhdGFiYXNlLnN0YXRpb25zKS5mb3JFYWNoKCB0aGlzLmFkZFN0YXRpb24uYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXR0YWNoZXMgdGhpcyBjb250cm9sIHRvIHRoZSBnaXZlbiBwYXJlbnQgYW5kIHJlc2V0cyBzb21lIHN0YXRlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaWNrZXIgUGlja2VyIHRvIGF0dGFjaCB0aGlzIGNvbnRyb2wgdG9cclxuICAgICAqIEBwYXJhbSBvblNlbGVjdCBEZWxlZ2F0ZSB0byBmaXJlIHdoZW4gY2hvb3NpbmcgYSBzdGF0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhdHRhY2gocGlja2VyOiBQaWNrZXIsIG9uU2VsZWN0OiBTZWxlY3REZWxlZ2F0ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBwaWNrZXIuZG9tRm9ybTtcclxuICAgICAgICBsZXQgY3VycmVudCA9IHRoaXMuZG9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIFJlLWVuYWJsZSBhbGwgZGlzYWJsZWQgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5xdWVyeVNlbGVjdG9yQWxsKGBkZFtkaXNhYmxlZF1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaCggdGhpcy5lbmFibGUuYmluZCh0aGlzKSApO1xyXG5cclxuICAgICAgICBpZiAoIWN1cnJlbnQgfHwgY3VycmVudCAhPT0gcGFyZW50KVxyXG4gICAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcbiAgICAgICAgdGhpcy5vblNlbGVjdCA9IG9uU2VsZWN0LmJpbmQocGlja2VyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUHJlLXNlbGVjdHMgYSBzdGF0aW9uIGVudHJ5IGJ5IGl0cyBjb2RlICovXHJcbiAgICBwdWJsaWMgcHJlc2VsZWN0Q29kZShjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9IHRoaXMuZ2V0QnlDb2RlKGNvZGUpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGVudHJ5KTtcclxuICAgICAgICBlbnRyeS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFbmFibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgb3Igc3RhdGlvbiBlbGVtZW50IGZvciBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBlbmFibGUoY29kZU9yTm9kZTogc3RyaW5nIHwgSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9ICh0eXBlb2YgY29kZU9yTm9kZSA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgID8gdGhpcy5nZXRCeUNvZGUoY29kZU9yTm9kZSlcclxuICAgICAgICAgICAgOiBjb2RlT3JOb2RlO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIERpc2FibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgZnJvbSBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBkaXNhYmxlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcbiAgICAgICAgbGV0IG5leHQgID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGVudHJ5LCAxKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgJycpO1xyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgndGFiaW5kZXgnKTtcclxuICAgICAgICBlbnRyeS50aXRsZSA9ICcnO1xyXG5cclxuICAgICAgICAvLyBTaGlmdCBmb2N1cyB0byBuZXh0IGF2YWlsYWJsZSBlbGVtZW50LCBmb3Iga2V5Ym9hcmQgbmF2aWdhdGlvblxyXG4gICAgICAgIGlmIChuZXh0KVxyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgYSBzdGF0aW9uJ3MgY2hvaWNlIGVsZW1lbnQgYnkgaXRzIGNvZGUgKi9cclxuICAgIHByaXZhdGUgZ2V0QnlDb2RlKGNvZGU6IHN0cmluZykgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmlucHV0Q2hvaWNlc1xyXG4gICAgICAgICAgICAucXVlcnlTZWxlY3RvcihgZGRbZGF0YS1jb2RlPSR7Y29kZX1dYCkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgKi9cclxuICAgIHByaXZhdGUgYWRkU3RhdGlvbihjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcbiAgICAgICAgbGV0IGxldHRlciAgPSBzdGF0aW9uWzBdO1xyXG4gICAgICAgIGxldCBncm91cCAgID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdO1xyXG5cclxuICAgICAgICBpZiAoIWdyb3VwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGhlYWRlciAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2R0Jyk7XHJcbiAgICAgICAgICAgIGhlYWRlci5pbm5lclRleHQgPSBsZXR0ZXIudG9VcHBlckNhc2UoKTtcclxuICAgICAgICAgICAgaGVhZGVyLnRhYkluZGV4ICA9IC0xO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkbCcpO1xyXG4gICAgICAgICAgICBncm91cC50YWJJbmRleCA9IDUwO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAuc2V0QXR0cmlidXRlKCdncm91cCcsICcnKTtcclxuICAgICAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoZ3JvdXApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVudHJ5ICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuICAgICAgICBlbnRyeS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgICAgIGVudHJ5LmlubmVyVGV4dCAgICAgICA9IHN0YXRpb247XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgICAgICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICAgICAgZW50cnkudGFiSW5kZXggICAgICAgID0gLTE7XHJcblxyXG4gICAgICAgIGdyb3VwLmFwcGVuZENoaWxkKGVudHJ5KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBTdGF0aW9uIGxpc3QgaXRlbSB0aGF0IGNhbiBiZSBkcmFnZ2VkIGFuZCBkcm9wcGVkICovXHJcbmNsYXNzIFN0YXRpb25MaXN0SXRlbVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gdGVtcGxhdGUgdG8gY2xvbmUsIGZvciBlYWNoIGl0ZW0gY3JlYXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI3N0YXRpb25MaXN0SXRlbVRlbXBsYXRlJyk7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmlkICAgICA9ICcnO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGl0ZW0ncyBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgc3RhdGlvbiBsaXN0IGl0ZW0sIG1lYW50IGZvciB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBjcmVhdGUgdGhpcyBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoY29kZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIGlmICghU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uaW5pdCgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICAgPSBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuZG9tLmlubmVyVGV4dCA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEJhc2UgY2xhc3MgZm9yIHBpY2tlciB2aWV3cyAqL1xyXG5hYnN0cmFjdCBjbGFzcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgZm9ybSBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUZvcm0gICA6IEhUTUxGb3JtRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBoZWFkZXIgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUhlYWRlciA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIEdldHMgdGhlIG5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgaGFuZGxlcyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHhtbFRhZyAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgYnkgdGhpcyBwaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBkb21FZGl0aW5nPyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHBpY2tlciB0byBoYW5kbGUgdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50IHR5cGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHhtbFRhZyBOYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIHdpbGwgaGFuZGxlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoeG1sVGFnOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgPSBET00ucmVxdWlyZShgIyR7eG1sVGFnfVBpY2tlcmApO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybSAgID0gRE9NLnJlcXVpcmUoJ2Zvcm0nLCAgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlciA9IERPTS5yZXF1aXJlKCdoZWFkZXInLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy54bWxUYWcgICAgPSB4bWxUYWc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNoYW5nZSAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uaW5wdXQgICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jbGljayAgID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9ua2V5ZG93biA9IHRoaXMub25JbnB1dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbnN1Ym1pdCAgPSB0aGlzLm9uU3VibWl0LmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBmb3JtIGZpZWxkcyBjaGFuZ2UuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCB1cGRhdGUgYWxsIGxpbmtlZFxyXG4gICAgICogZWxlbWVudHMgKGUuZy4gb2Ygc2FtZSB0eXBlKSB3aXRoIHRoZSBuZXcgZGF0YSBoZXJlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DaGFuZ2UoZXY6IEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEgbW91c2UgY2xpY2sgaGFwcGVucyBhbnl3aGVyZSBpbiBvciBvbiB0aGUgcGlja2VyJ3MgZm9ybSAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBrZXkgaXMgcHJlc3NlZCB3aGlsc3QgdGhlIHBpY2tlcidzIGZvcm0gaXMgZm9jdXNlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIEVOVEVSIGlzIHByZXNzZWQgd2hpbHN0IGEgZm9ybSBjb250cm9sIG9mIHRoZSBwaWNrZXIgaXMgZm9jdXNlZC5cclxuICAgICAqIEJ5IGRlZmF1bHQsIHRoaXMgd2lsbCB0cmlnZ2VyIHRoZSBvbkNoYW5nZSBoYW5kbGVyIGFuZCBjbG9zZSB0aGUgZGlhbG9nLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMub25DaGFuZ2UoZXYpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW4gdGhpcyBwaWNrZXIgZm9yIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCBmaWxsXHJcbiAgICAgKiBpdHMgZm9ybSBlbGVtZW50cyB3aXRoIGRhdGEgZnJvbSB0aGUgY3VycmVudCBzdGF0ZSBhbmQgdGFyZ2V0ZWQgZWxlbWVudCBoZXJlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IHRhcmdldCBQaHJhc2UgZWxlbWVudCB0aGF0IHRoaXMgcGlja2VyIGlzIGJlaW5nIG9wZW5lZCBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nID0gdGFyZ2V0O1xyXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9zaXRpb25zIHRoaXMgcGlja2VyIHJlbGF0aXZlIHRvIHRoZSB0YXJnZXQgcGhyYXNlIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBsYXlvdXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgdGFyZ2V0UmVjdCA9IHRoaXMuZG9tRWRpdGluZy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBsZXQgZnVsbFdpZHRoICA9IHRoaXMuZG9tLmNsYXNzTGlzdC5jb250YWlucygnZnVsbFdpZHRoJyk7XHJcbiAgICAgICAgbGV0IGlzTW9kYWwgICAgPSB0aGlzLmRvbS5jbGFzc0xpc3QuY29udGFpbnMoJ21vZGFsJyk7XHJcbiAgICAgICAgbGV0IGRvY1cgICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoO1xyXG4gICAgICAgIGxldCBkb2NIICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRIZWlnaHQ7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1ggICAgPSAodGFyZ2V0UmVjdC5sZWZ0ICAgfCAwKSAtIDg7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1kgICAgPSAgdGFyZ2V0UmVjdC5ib3R0b20gfCAwO1xyXG4gICAgICAgIGxldCBkaWFsb2dXICAgID0gKHRhcmdldFJlY3Qud2lkdGggIHwgMCkgKyAxNjtcclxuXHJcbiAgICAgICAgLy8gQWRqdXN0IGlmIGhvcml6b250YWxseSBvZmYgc2NyZWVuXHJcbiAgICAgICAgaWYgKCFmdWxsV2lkdGggJiYgIWlzTW9kYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBGb3JjZSBmdWxsIHdpZHRoIG9uIG1vYmlsZVxyXG4gICAgICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCA9IGAxMDAlYDtcclxuXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dYID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoICAgID0gYGluaXRpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUubWluV2lkdGggPSBgJHtkaWFsb2dXfXB4YDtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZGlhbG9nWCArIHRoaXMuZG9tLm9mZnNldFdpZHRoID4gZG9jVylcclxuICAgICAgICAgICAgICAgICAgICBkaWFsb2dYID0gKHRhcmdldFJlY3QucmlnaHQgfCAwKSAtIHRoaXMuZG9tLm9mZnNldFdpZHRoICsgODtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBpY2tlcnMgdGhhdCBpbnN0ZWFkIHRha2UgdXAgdGhlIHdob2xlIGRpc3BsYXkuIENTUyBpc24ndCB1c2VkIGhlcmUsXHJcbiAgICAgICAgLy8gYmVjYXVzZSBwZXJjZW50YWdlLWJhc2VkIGxlZnQvdG9wIGNhdXNlcyBzdWJwaXhlbCBpc3N1ZXMgb24gQ2hyb21lLlxyXG4gICAgICAgIGlmIChpc01vZGFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZGlhbG9nWCA9IERPTS5pc01vYmlsZSA/IDAgOiAoIChkb2NXICogMC4xKSAvIDIgKSB8IDA7XHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSBET00uaXNNb2JpbGUgPyAwIDogKCAoZG9jSCAqIDAuMSkgLyAyICkgfCAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgdG8gdG9wIGVkZ2Ugb2YgZG9jdW1lbnRcclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiB2ZXJ0aWNhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZICsgdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ID4gZG9jSClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAodGFyZ2V0UmVjdC50b3AgfCAwKSAtIHRoaXMuZG9tLm9mZnNldEhlaWdodCArIDE7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdiZWxvdycpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYWJvdmUnKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHN0aWxsIG9mZi1zY3JlZW4sIGNsYW1wIHRvIGJvdHRvbVxyXG4gICAgICAgICAgICBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dZID0gZG9jSCAtIHRoaXMuZG9tLm9mZnNldEhlaWdodDtcclxuXHJcbiAgICAgICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50LiBMaWtlbHkgaGFwcGVucyBpZiB0YXJnZXQgZWxlbWVudCBpcyBsYXJnZS5cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgPCAwKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdhYm92ZScpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYmVsb3cnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLmxlZnQgPSAoZnVsbFdpZHRoID8gMCA6IGRpYWxvZ1gpICsgJ3B4JztcclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS50b3AgID0gZGlhbG9nWSArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJldHVybnMgdHJ1ZSBpZiBhbiBlbGVtZW50IGluIHRoaXMgcGlja2VyIGN1cnJlbnRseSBoYXMgZm9jdXMgKi9cclxuICAgIHB1YmxpYyBoYXNGb2N1cygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyhkb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGNvYWNoIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgQ29hY2hQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGxldHRlciBkcm9wLWRvd24gaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExldHRlciA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgY29hY2ggZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2NvYWNoJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgPSBET00ucmVxdWlyZSgnc2VsZWN0JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDI2OyBpKyspXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5pbnB1dExldHRlciwgTC5MRVRURVJTW2ldLCBMLkxFVFRFUlNbaV0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgdGFyZ2V0IGNvbnRleHQncyBjb2FjaCBsZXR0ZXIgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9DT0FDSCh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gUkFHLnN0YXRlLmdldENvYWNoKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBjb2FjaCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1jb2FjaF1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0TGV0dGVyLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBleGN1c2UgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBFeGN1c2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdleGN1c2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfRVhDVVNFO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2UuZXhjdXNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgZXhjdXNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUuZXhjdXNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIGV4Y3VzZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5leGN1c2UgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ2V4Y3VzZScsIFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgaW50ZWdlciBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIEludGVnZXJQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG51bWVyaWNhbCBpbnB1dCBzcGlubmVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlnaXQgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG9wdGlvbmFsIHN1ZmZpeCBsYWJlbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MYWJlbCAgIDogSFRNTExhYmVsRWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IGludGVnZXIgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvcHRpb25hbCBzaW5ndWxhciBzdWZmaXggZm9yIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHNpbmd1bGFyPyAgOiBzdHJpbmc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9wdGlvbmFsIHBsdXJhbCBzdWZmaXggZm9yIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHBsdXJhbD8gICAgOiBzdHJpbmc7XHJcbiAgICAvKiogV2hldGhlciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCB3YW50cyB3b3JkIGRpZ2l0cyAqL1xyXG4gICAgcHJpdmF0ZSB3b3Jkcz8gICAgIDogYm9vbGVhbjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdpbnRlZ2VyJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdCA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUxhYmVsICAgPSBET00ucmVxdWlyZSgnbGFiZWwnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIC8vIGlPUyBuZWVkcyBkaWZmZXJlbnQgdHlwZSBhbmQgcGF0dGVybiB0byBzaG93IGEgbnVtZXJpY2FsIGtleWJvYXJkXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC50eXBlICAgID0gJ3RlbCc7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5wYXR0ZXJuID0gJ1swLTldKyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgdGFyZ2V0IGNvbnRleHQncyBpbnRlZ2VyIGRhdGEgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLnNpbmd1bGFyICAgPSB0YXJnZXQuZGF0YXNldFsnc2luZ3VsYXInXTtcclxuICAgICAgICB0aGlzLnBsdXJhbCAgICAgPSB0YXJnZXQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgdGhpcy53b3JkcyAgICAgID0gUGFyc2UuYm9vbGVhbih0YXJnZXQuZGF0YXNldFsnd29yZHMnXSB8fCAnZmFsc2UnKTtcclxuXHJcbiAgICAgICAgbGV0IHZhbHVlID0gUkFHLnN0YXRlLmdldEludGVnZXIodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgaWYgICAgICAodGhpcy5zaW5ndWxhciAmJiB2YWx1ZSA9PT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnNpbmd1bGFyO1xyXG4gICAgICAgIGVsc2UgaWYgKHRoaXMucGx1cmFsICYmIHZhbHVlICE9PSAxKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMucGx1cmFsO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSAnJztcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfSU5URUdFUih0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRDdHggPT09ICdjb2FjaGVzJykge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQubWluID0gJzAnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQubWF4ID0gJzYwJztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucmVtb3ZlQXR0cmlidXRlKCdtaW4nKTtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnJlbW92ZUF0dHJpYnV0ZSgnbWF4Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgICA9IHZhbHVlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGludGVnZXIgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBDYW4ndCB1c2UgdmFsdWVBc051bWJlciBkdWUgdG8gaU9TIGlucHV0IHR5cGUgd29ya2Fyb3VuZHNcclxuICAgICAgICBsZXQgaW50ICAgID0gcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBJZ25vcmUgaW52YWxpZCB2YWx1ZXNcclxuICAgICAgICBpZiAoIGlzTmFOKGludCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRDdHggPT09ICdjb2FjaGVzJykge1xyXG4gICAgICAgICAgICBpZiAoaW50IDwgMCkgeyBpbnQgPSAwOyB0aGlzLmlucHV0RGlnaXQudmFsdWUgPSAnMCc7IH1cclxuICAgICAgICAgICAgaWYgKGludCA+IDYwKSB7IGludCA9IDYwOyB0aGlzLmlucHV0RGlnaXQudmFsdWUgPSAnNjAnOyB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgaW50U3RyID0gKHRoaXMud29yZHMpXHJcbiAgICAgICAgICAgID8gTC5ESUdJVFNbaW50XSB8fCBpbnQudG9TdHJpbmcoKVxyXG4gICAgICAgICAgICA6IGludC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoaW50ID09PSAxICYmIHRoaXMuc2luZ3VsYXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3RoaXMuc2luZ3VsYXJ9YDtcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnNpbmd1bGFyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChpbnQgIT09IDEgJiYgdGhpcy5wbHVyYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3RoaXMucGx1cmFsfWA7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5wbHVyYWw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0SW50ZWdlcih0aGlzLmN1cnJlbnRDdHgsIGludCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPWludGVnZXJdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gaW50U3RyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBuYW1lZCB0cmFpbiBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIE5hbWVkUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignbmFtZWQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfTkFNRUQ7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5uYW1lZC5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBuYW1lXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgbmFtZWQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUubmFtZWQgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ25hbWVkJywgUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZXNldCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFBocmFzZXNldFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgcmVmZXJlbmNlIHRhZyBmb3IgdGhlIGN1cnJlbnQgcGhyYXNlc2V0IGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRSZWYgOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdwaHJhc2VzZXQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHBocmFzZXNldCdzIGxpc3Qgb2YgcGhyYXNlcyAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgcmVmICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBpZHggICAgICAgPSBwYXJzZUludCggRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2lkeCcpICk7XHJcbiAgICAgICAgbGV0IHBocmFzZXNldCA9IGFzc2VydCggUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpISApO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRSZWYgICAgICAgICAgPSByZWY7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5jbGVhcigpO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBwaHJhc2UsIHdlIG5lZWQgdG8gcnVuIGl0IHRocm91Z2ggdGhlIHBocmFzZXIgdXNpbmcgdGhlIGN1cnJlbnQgc3RhdGVcclxuICAgICAgICAvLyB0byBnZW5lcmF0ZSBcInByZXZpZXdzXCIgb2YgaG93IHRoZSBwaHJhc2Ugd2lsbCBsb29rLlxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGhyYXNlc2V0LmNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBocmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcblxyXG4gICAgICAgICAgICBET00uY2xvbmVJbnRvKHBocmFzZXNldC5jaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudCwgcGhyYXNlKTtcclxuICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2VzcyhwaHJhc2UpO1xyXG5cclxuICAgICAgICAgICAgcGhyYXNlLmlubmVyVGV4dCAgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgICAgICBwaHJhc2UuZGF0YXNldC5pZHggPSBpLnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmRvbUNob29zZXIuYWRkUmF3KHBocmFzZSwgaSA9PT0gaWR4KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBwaHJhc2VzZXQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoZW50cnkuZGF0YXNldFsnaWR4J10hKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFBocmFzZXNldElkeCh0aGlzLmN1cnJlbnRSZWYsIGlkeCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IucmVmcmVzaFBocmFzZXNldCh0aGlzLmN1cnJlbnRSZWYpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGxhdGZvcm0gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBQbGF0Zm9ybVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbnVtZXJpY2FsIGlucHV0IHNwaW5uZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaWdpdCAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGxldHRlciBkcm9wLWRvd24gaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExldHRlciA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3BsYXRmb3JtJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdCAgICAgICAgICA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyICAgICAgICAgPSBET00ucmVxdWlyZSgnc2VsZWN0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1BMQVRGT1JNO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBwbGF0Zm9ybSBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnZhbHVlICA9IHZhbHVlWzBdO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSB2YWx1ZVsxXTtcclxuICAgICAgICB0aGlzLnVwZGF0ZUxldHRlclZpc2liaWxpdHkoKTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgcGxhdGZvcm0gZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaW50VmFsID0gcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKTtcclxuICAgICAgICAvLyBJZ25vcmUgaW52YWxpZCB2YWx1ZXNcclxuICAgICAgICBpZiAoIGlzTmFOKCBpbnRWYWwgKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKGludFZhbCA8IDApIHsgaW50VmFsID0gMDsgdGhpcy5pbnB1dERpZ2l0LnZhbHVlID0gJzAnOyB9XHJcbiAgICAgICAgaWYgKGludFZhbCA+IDYwKSB7IGludFZhbCA9IDYwOyB0aGlzLmlucHV0RGlnaXQudmFsdWUgPSAnNjAnOyB9XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlTGV0dGVyVmlzaWJpbGl0eSgpO1xyXG5cclxuICAgICAgICAvLyAnTScgKDnCvikgaXMgb25seSB2YWxpZCBmb3IgcGxhdGZvcm0gOVxyXG4gICAgICAgIGlmIChpbnRWYWwgIT09IDkgJiYgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9PT0gJ00nKVxyXG4gICAgICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gJyc7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5wbGF0Zm9ybSA9IFt0aGlzLmlucHV0RGlnaXQudmFsdWUsIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWVdO1xyXG5cclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCggJ3BsYXRmb3JtJywgKFJBRy5zdGF0ZS5wbGF0Zm9ybVsxXSA9PT0gJ00nKVxyXG4gICAgICAgICAgICA/IFJBRy5zdGF0ZS5wbGF0Zm9ybVswXSArICfCvidcclxuICAgICAgICAgICAgOiBSQUcuc3RhdGUucGxhdGZvcm0uam9pbignJykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGlkZXMgYW5kIGNsZWFycyB0aGUgbGV0dGVyIHNlbGVjdG9yIGlmIHBsYXRmb3JtIG51bWJlciBpcyA+IDI2ICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZUxldHRlclZpc2liaWxpdHkoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaW50VmFsID0gcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKTtcclxuICAgICAgICBsZXQgaGlkZSAgID0gaXNOYU4oaW50VmFsKSB8fCBpbnRWYWwgPiAyNjtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci5oaWRkZW4gICA9IGhpZGU7XHJcbiAgICAgICAgaWYgKGhpZGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlICAgID0gJyc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBPbmx5IHBsYXRmb3JtIDkgaGFzIGEgXCI5wr5cIiAoTSkgcHJvbnVuY2lhdGlvblxyXG4gICAgICAgIGxldCBtT3B0aW9uID0gdGhpcy5pbnB1dExldHRlci5xdWVyeVNlbGVjdG9yKCdvcHRpb25bdmFsdWU9XCJNXCJdJykgYXMgSFRNTE9wdGlvbkVsZW1lbnQ7XHJcbiAgICAgICAgaWYgKG1PcHRpb24pXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBtT3B0aW9uLmhpZGRlbiAgID0gIShpbnRWYWwgPT09IDkpO1xyXG4gICAgICAgICAgICBtT3B0aW9uLmRpc2FibGVkID0gIShpbnRWYWwgPT09IDkpO1xyXG4gICAgICAgICAgICBpZiAoaW50VmFsICE9PSA5ICYmIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPT09ICdNJylcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSAnJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2VydmljZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFNlcnZpY2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHNlcnZpY2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3NlcnZpY2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBzZXJ2aWNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU0VSVklDRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBzZXJ2aWNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdCggUkFHLnN0YXRlLmdldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc2VydmljZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCwgZW50cnkuaW5uZXJUZXh0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9c2VydmljZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc3RhdGlvbiBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFN0YXRpb25QaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIHNoYXJlZCBzdGF0aW9uIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBjaG9vc2VyIDogU3RhdGlvbkNob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBzdGF0aW9uIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvbk9wZW4gZGVsZWdhdGUgZm9yIFN0YXRpb25QaWNrZXIgb3IgZm9yIFN0YXRpb25MaXN0UGlja2VyICovXHJcbiAgICBwcm90ZWN0ZWQgb25PcGVuICAgICA6ICh0YXJnZXQ6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcih0YWc6IHN0cmluZyA9ICdzdGF0aW9uJylcclxuICAgIHtcclxuICAgICAgICBzdXBlcih0YWcpO1xyXG5cclxuICAgICAgICBpZiAoIVN0YXRpb25QaWNrZXIuY2hvb3NlcilcclxuICAgICAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyID0gbmV3IFN0YXRpb25DaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcblxyXG4gICAgICAgIHRoaXMub25PcGVuID0gdGhpcy5vblN0YXRpb25QaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpcmVzIHRoZSBvbk9wZW4gZGVsZWdhdGUgcmVnaXN0ZXJlZCBmb3IgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuICAgICAgICB0aGlzLm9uT3Blbih0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBdHRhY2hlcyB0aGUgc3RhdGlvbiBjaG9vc2VyIGFuZCBmb2N1c2VzIGl0IG9udG8gdGhlIGN1cnJlbnQgZWxlbWVudCdzIHN0YXRpb24gKi9cclxuICAgIHByb3RlY3RlZCBvblN0YXRpb25QaWNrZXJPcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaG9vc2VyICAgICA9IFN0YXRpb25QaWNrZXIuY2hvb3NlcjtcclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjaG9vc2VyLmF0dGFjaCh0aGlzLCB0aGlzLm9uU2VsZWN0U3RhdGlvbik7XHJcbiAgICAgICAgY2hvb3Nlci5wcmVzZWxlY3RDb2RlKCBSQUcuc3RhdGUuZ2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgpICk7XHJcbiAgICAgICAgY2hvb3Nlci5zZWxlY3RPbkNsaWNrID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU1RBVElPTih0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBzdGF0aW9uIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vbkNsaWNrKGV2KTsgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vbklucHV0KGV2KTsgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc3RhdGlvbiBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdFN0YXRpb24oZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcXVlcnkgPSBgW2RhdGEtdHlwZT1zdGF0aW9uXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWA7XHJcbiAgICAgICAgbGV0IGNvZGUgID0gZW50cnkuZGF0YXNldFsnY29kZSddITtcclxuICAgICAgICBsZXQgbmFtZSAgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFN0YXRpb24odGhpcy5jdXJyZW50Q3R4LCBjb2RlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkocXVlcnkpXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IG5hbWUpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInN0YXRpb25QaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi8uLi92ZW5kb3IvZHJhZ2dhYmxlLmQudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHN0YXRpb24gbGlzdCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFN0YXRpb25MaXN0UGlja2VyIGV4dGVuZHMgU3RhdGlvblBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY29udGFpbmVyIGZvciB0aGUgbGlzdCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUxpc3QgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbW9iaWxlLW9ubHkgYWRkIHN0YXRpb24gYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkFkZCAgICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbW9iaWxlLW9ubHkgY2xvc2UgcGlja2VyIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5DbG9zZSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGRyb3Agem9uZSBmb3IgZGVsZXRpbmcgc3RhdGlvbiBlbGVtZW50cyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21EZWwgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGFjdHVhbCBzb3J0YWJsZSBsaXN0IG9mIHN0YXRpb25zICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGlzdCAgICA6IEhUTUxETGlzdEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHBsYWNlaG9sZGVyIHNob3duIGlmIHRoZSBsaXN0IGlzIGVtcHR5ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUVtcHR5TGlzdCA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoXCJzdGF0aW9ubGlzdFwiKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21MaXN0ICAgICAgPSBET00ucmVxdWlyZSgnLnN0YXRpb25MaXN0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuYnRuQWRkICAgICAgID0gRE9NLnJlcXVpcmUoJy5hZGRTdGF0aW9uJywgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5idG5DbG9zZSAgICAgPSBET00ucmVxdWlyZSgnLmNsb3NlUGlja2VyJywgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmRvbURlbCAgICAgICA9IERPTS5yZXF1aXJlKCcuZGVsU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0ICAgID0gRE9NLnJlcXVpcmUoJ2RsJywgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QgPSBET00ucmVxdWlyZSgncCcsICAgICAgICAgICAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLm9uT3BlbiAgICAgICA9IHRoaXMub25TdGF0aW9uTGlzdFBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgbmV3IERyYWdnYWJsZS5Tb3J0YWJsZShbdGhpcy5pbnB1dExpc3QsIHRoaXMuZG9tRGVsXSwgeyBkcmFnZ2FibGU6ICdkZCcgfSlcclxuICAgICAgICAgICAgLy8gSGF2ZSB0byB1c2UgdGltZW91dCwgdG8gbGV0IERyYWdnYWJsZSBmaW5pc2ggc29ydGluZyB0aGUgbGlzdFxyXG4gICAgICAgICAgICAub24oICdkcmFnOnN0b3AnLCBldiA9PiBzZXRUaW1lb3V0KCgpID0+IHRoaXMub25EcmFnU3RvcChldiksIDEpIClcclxuICAgICAgICAgICAgLm9uKCAnbWlycm9yOmNyZWF0ZScsIHRoaXMub25EcmFnTWlycm9yQ3JlYXRlLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBvcHVsYXRlcyB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIsIHdpdGggdGhlIHNlbGVjdGVkIGxpc3QuIEJlY2F1c2UgdGhpcyBwaWNrZXJcclxuICAgICAqIGV4dGVuZHMgZnJvbSBTdGF0aW9uTGlzdCwgdGhpcyBoYW5kbGVyIG92ZXJyaWRlcyB0aGUgJ29uT3BlbicgZGVsZWdhdGUgcHJvcGVydHlcclxuICAgICAqIG9mIFN0YXRpb25MaXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgU3RhdGlvbiBsaXN0IGVkaXRvciBlbGVtZW50IHRvIG9wZW4gZm9yXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvblN0YXRpb25MaXN0UGlja2VyT3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTaW5jZSB3ZSBzaGFyZSB0aGUgc3RhdGlvbiBwaWNrZXIgd2l0aCBTdGF0aW9uTGlzdCwgZ3JhYiBpdFxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5hdHRhY2godGhpcywgdGhpcy5vbkFkZFN0YXRpb24pO1xyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5zZWxlY3RPbkNsaWNrID0gZmFsc2U7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IGVudHJpZXMgICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KHRoaXMuY3VycmVudEN0eCkuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU1RBVElPTkxJU1QodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIGFsbCBvbGQgbGlzdCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmlubmVySFRNTCA9ICcnO1xyXG5cclxuICAgICAgICAvLyBGaW5hbGx5LCBwb3B1bGF0ZSBsaXN0IGZyb20gdGhlIGNsaWNrZWQgc3RhdGlvbiBsaXN0IGVsZW1lbnRcclxuICAgICAgICBlbnRyaWVzLmZvckVhY2goIHYgPT4gdGhpcy5hZGQodikgKTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWQgeyBzdXBlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbGljayBldmVudHMsIGZvciBjaG9vc2luZyBpdGVtcyAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uQ2xpY2soZXYpO1xyXG5cclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkNsb3NlKVxyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgLy8gRm9yIG1vYmlsZSB1c2Vycywgc3dpdGNoIHRvIHN0YXRpb24gY2hvb3NlciBzY3JlZW4gaWYgXCJBZGQuLi5cIiB3YXMgY2xpY2tlZFxyXG4gICAgICAgIGlmIChldi50YXJnZXQgPT09IHRoaXMuYnRuQWRkKVxyXG4gICAgICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QuYWRkKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMga2V5Ym9hcmQgbmF2aWdhdGlvbiBmb3IgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyICovXHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub25JbnB1dChldik7XHJcblxyXG4gICAgICAgIGxldCBrZXkgICAgID0gZXYua2V5O1xyXG4gICAgICAgIGxldCBmb2N1c2VkID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gT25seSBoYW5kbGUgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyIGNvbnRyb2xcclxuICAgICAgICBpZiAoICFmb2N1c2VkIHx8ICF0aGlzLmlucHV0TGlzdC5jb250YWlucyhmb2N1c2VkKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGtleWJvYXJkIG5hdmlnYXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnQXJyb3dMZWZ0JyB8fCBrZXkgPT09ICdBcnJvd1JpZ2h0JylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBkaXIgPSAoa2V5ID09PSAnQXJyb3dMZWZ0JykgPyAtMSA6IDE7XHJcbiAgICAgICAgICAgIGxldCBuYXYgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gZm9jdXNlZCBlbGVtZW50XHJcbiAgICAgICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxldmFudCB0byBiZWdpbm5pbmcgb3IgZW5kIG9mIGNvbnRhaW5lclxyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPT09IC0xKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmxhc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAobmF2KSBuYXYuZm9jdXMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBlbnRyeSBkZWxldGlvblxyXG4gICAgICAgIGlmIChrZXkgPT09ICdEZWxldGUnIHx8IGtleSA9PT0gJ0JhY2tzcGFjZScpXHJcbiAgICAgICAgaWYgKGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dExpc3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBGb2N1cyBvbiBuZXh0IGVsZW1lbnQgb3IgcGFyZW50IG9uIGRlbGV0ZVxyXG4gICAgICAgICAgICBsZXQgbmV4dCA9IGZvY3VzZWQucHJldmlvdXNFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IGZvY3VzZWQubmV4dEVsZW1lbnRTaWJsaW5nICAgICBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHRoaXMuaW5wdXRMaXN0O1xyXG5cclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZm9jdXNlZCk7XHJcbiAgICAgICAgICAgIG5leHQuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXIgZm9yIHdoZW4gYSBzdGF0aW9uIGlzIGNob3NlbiAqL1xyXG4gICAgcHJpdmF0ZSBvbkFkZFN0YXRpb24oZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV3RW50cnkgPSB0aGlzLmFkZChlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuXHJcbiAgICAgICAgLy8gU3dpdGNoIGJhY2sgdG8gYnVpbGRlciBzY3JlZW4sIGlmIG9uIG1vYmlsZVxyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5yZW1vdmUoJ2FkZGluZ1N0YXRpb24nKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG5cclxuICAgICAgICAvLyBGb2N1cyBvbmx5IGlmIG9uIG1vYmlsZSwgc2luY2UgdGhlIHN0YXRpb24gbGlzdCBpcyBvbiBhIGRlZGljYXRlZCBzY3JlZW5cclxuICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uZm9jdXMoKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIG5ld0VudHJ5LmRvbS5zY3JvbGxJbnRvVmlldygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaXhlcyBtaXJyb3JzIG5vdCBoYXZpbmcgY29ycmVjdCB3aWR0aCBvZiB0aGUgc291cmNlIGVsZW1lbnQsIG9uIGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvbkRyYWdNaXJyb3JDcmVhdGUoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LmRhdGEuc291cmNlIS5zdHlsZS53aWR0aCA9IGV2LmRhdGEub3JpZ2luYWxTb3VyY2UhLmNsaWVudFdpZHRoICsgJ3B4JztcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBkcmFnZ2FibGUgc3RhdGlvbiBuYW1lIGJlaW5nIGRyb3BwZWQgKi9cclxuICAgIHByaXZhdGUgb25EcmFnU3RvcChldjogRHJhZ2dhYmxlLkRyYWdFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFldi5kYXRhLm9yaWdpbmFsU291cmNlKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmIChldi5kYXRhLm9yaWdpbmFsU291cmNlLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuZG9tRGVsKVxyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZShldi5kYXRhLm9yaWdpbmFsU291cmNlKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBhZGRzIGEgbmV3IGVudHJ5IGZvciB0aGUgYnVpbGRlciBsaXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gY3JlYXRlIGFuIGl0ZW0gZm9yXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYWRkKGNvZGU6IHN0cmluZykgOiBTdGF0aW9uTGlzdEl0ZW1cclxuICAgIHtcclxuICAgICAgICBsZXQgbmV3RW50cnkgPSBuZXcgU3RhdGlvbkxpc3RJdGVtKGNvZGUpO1xyXG5cclxuICAgICAgICAvLyBBZGQgdGhlIG5ldyBlbnRyeSB0byB0aGUgc29ydGFibGUgbGlzdFxyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmFwcGVuZENoaWxkKG5ld0VudHJ5LmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QuaGlkZGVuID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gRGlzYWJsZSB0aGUgYWRkZWQgc3RhdGlvbiBpbiB0aGUgY2hvb3NlclxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5kaXNhYmxlKGNvZGUpO1xyXG5cclxuICAgICAgICAvLyBEZWxldGUgaXRlbSBvbiBkb3VibGUgY2xpY2tcclxuICAgICAgICBuZXdFbnRyeS5kb20ub25kYmxjbGljayA9IF8gPT4gdGhpcy5yZW1vdmUobmV3RW50cnkuZG9tKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5ld0VudHJ5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVtb3ZlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBlbnRyeSBlbGVtZW50IGZyb20gdGhlIGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVudHJ5IEVsZW1lbnQgb2YgdGhlIHN0YXRpb24gZW50cnkgdG8gcmVtb3ZlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVtb3ZlKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhdGhpcy5kb21MaXN0LmNvbnRhaW5zKGVudHJ5KSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdBdHRlbXB0ZWQgdG8gcmVtb3ZlIGVudHJ5IG5vdCBvbiBzdGF0aW9uIGxpc3QgYnVpbGRlcicpO1xyXG5cclxuICAgICAgICAvLyBFbmFibGVkIHRoZSByZW1vdmVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZW5hYmxlKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG5cclxuICAgICAgICBlbnRyeS5yZW1vdmUoKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5pbnB1dExpc3QuY2hpbGRyZW4ubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdC5oaWRkZW4gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgc3RhdGlvbiBsaXN0IGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoaWxkcmVuID0gdGhpcy5pbnB1dExpc3QuY2hpbGRyZW47XHJcblxyXG4gICAgICAgIC8vIERvbid0IHVwZGF0ZSBpZiBsaXN0IGlzIGVtcHR5XHJcbiAgICAgICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgbGlzdCA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVudHJ5ID0gY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBsaXN0LnB1c2goZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgdGV4dExpc3QgPSBTdHJpbmdzLmZyb21TdGF0aW9uTGlzdChsaXN0LnNsaWNlKCksIHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICAgID0gYFtkYXRhLXR5cGU9c3RhdGlvbmxpc3RdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFN0YXRpb25MaXN0KHRoaXMuY3VycmVudEN0eCwgbGlzdCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5KVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0ZXh0TGlzdCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0aW1lIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgVGltZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgdGltZSBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0VGltZTogSFRNTElucHV0RWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHRpbWUgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3RpbWUnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgdGltZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1RJTUUodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUudmFsdWUgPSBSQUcuc3RhdGUuZ2V0VGltZSh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHRpbWUgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUuc2V0VGltZSh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9dGltZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0VGltZS52YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEJhc2UgY2xhc3MgZm9yIGNvbmZpZ3VyYXRpb24gb2JqZWN0cywgdGhhdCBjYW4gc2F2ZSwgbG9hZCwgYW5kIHJlc2V0IHRoZW1zZWx2ZXMgKi9cclxuYWJzdHJhY3QgY2xhc3MgQ29uZmlnQmFzZTxUIGV4dGVuZHMgQ29uZmlnQmFzZTxUPj5cclxue1xyXG4gICAgLyoqIGxvY2FsU3RvcmFnZSBrZXkgd2hlcmUgY29uZmlnIGlzIGV4cGVjdGVkIHRvIGJlIHN0b3JlZCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VUVElOR1NfS0VZIDogc3RyaW5nID0gJ3NldHRpbmdzJztcclxuXHJcbiAgICAvKiogUHJvdG90eXBlIG9iamVjdCBmb3IgY3JlYXRpbmcgbmV3IGNvcGllcyBvZiBzZWxmICovXHJcbiAgICBwcml2YXRlIHR5cGUgOiAobmV3ICgpID0+IFQpO1xyXG5cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3RvciggdHlwZTogKG5ldyAoKSA9PiBUKSApXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy50eXBlID0gdHlwZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IGxvYWRzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiBmcm9tIGxvY2FsU3RvcmFnZSwgaWYgYW55ICovXHJcbiAgICBwdWJsaWMgbG9hZCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBzZXR0aW5ncyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShDb25maWdCYXNlLlNFVFRJTkdTX0tFWSk7XHJcblxyXG4gICAgICAgIGlmICghc2V0dGluZ3MpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgY29uZmlnID0gSlNPTi5wYXJzZShzZXR0aW5ncyk7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgY29uZmlnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGVycilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFsZXJ0KCBMLkNPTkZJR19MT0FEX0ZBSUwoZXJyLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBzYXZlcyB0aGlzIGNvbmZpZ3VyYXRpb24gdG8gbG9jYWxTdG9yYWdlICovXHJcbiAgICBwdWJsaWMgc2F2ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCBDb25maWdCYXNlLlNFVFRJTkdTX0tFWSwgSlNPTi5zdHJpbmdpZnkodGhpcykgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGVycilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFsZXJ0KCBMLkNPTkZJR19TQVZFX0ZBSUwoZXJyLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBkZWxldGVzIHRoaXMgY29uZmlndXJhdGlvbiBmcm9tIGxvY2FsU3RvcmFnZSBhbmQgcmVzZXRzIHN0YXRlICovXHJcbiAgICBwdWJsaWMgcmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oIHRoaXMsIG5ldyB0aGlzLnR5cGUoKSApO1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oQ29uZmlnQmFzZS5TRVRUSU5HU19LRVkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZXJyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX1JFU0VUX0ZBSUwoZXJyLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy88cmVmZXJlbmNlIHBhdGg9XCJjb25maWdCYXNlLnRzXCIvPlxyXG5cclxuLyoqIEhvbGRzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiBmb3IgUkFHICovXHJcbmNsYXNzIENvbmZpZyBleHRlbmRzIENvbmZpZ0Jhc2U8Q29uZmlnPlxyXG57XHJcbiAgICAvKiogSWYgdXNlciBoYXMgY2xpY2tlZCBzaHVmZmxlIGF0IGxlYXN0IG9uY2UgKi9cclxuICAgIHB1YmxpYyBjbGlja2VkR2VuZXJhdGUgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogSWYgdXNlciBoYXMgcmVhZCB0aGUgZGlzY2xhaW1lciAqL1xyXG4gICAgcHVibGljIHJlYWREaXNjbGFpbWVyICA6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIC8qKiBWb2x1bWUgZm9yIHNwZWVjaCB0byBiZSBzZXQgYXQgKi9cclxuICAgIHB1YmxpYyBzcGVlY2hWb2wgICAgICAgOiBudW1iZXIgID0gMS4wO1xyXG4gICAgLyoqIFBpdGNoIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgc3BlZWNoUGl0Y2ggICAgIDogbnVtYmVyICA9IDEuMDtcclxuICAgIC8qKiBSYXRlIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgc3BlZWNoUmF0ZSAgICAgIDogbnVtYmVyICA9IDEuMDtcclxuICAgIC8qKiBWT1gga2V5IG9mIHRoZSBjaGltZSB0byB1c2UgcHJpb3IgdG8gc3BlYWtpbmcgKi9cclxuICAgIHB1YmxpYyB2b3hDaGltZSAgICAgICAgOiBzdHJpbmcgID0gJyc7XHJcbiAgICAvKiogUmVsYXRpdmUgb3IgYWJzb2x1dGUgVVJMIG9mIHRoZSBjdXN0b20gVk9YIHZvaWNlIHRvIHVzZSAqL1xyXG4gICAgcHVibGljIHZveEN1c3RvbVBhdGggICA6IHN0cmluZyAgPSAnJztcclxuICAgIC8qKiBXaGV0aGVyIHRvIHVzZSB0aGUgVk9YIGVuZ2luZSAqL1xyXG4gICAgcHVibGljIHZveEVuYWJsZWQgICAgICA6IGJvb2xlYW4gPSB0cnVlO1xyXG4gICAgLyoqIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCBvZiB0aGUgVk9YIHZvaWNlIHRvIHVzZSAqL1xyXG4gICAgcHVibGljIHZveFBhdGggICAgICAgICA6IHN0cmluZyAgPSAnaHR0cHM6Ly96enotY3JlYXRvci5naXRodWIuaW8vUkFHLVZPWC1Sb3knO1xyXG5cclxuICAgIC8qKiBDaG9pY2Ugb2Ygc3BlZWNoIHZvaWNlIHRvIHVzZSBhcyB2b2ljZSBuYW1lLCBvciAnJyBpZiB1bnNldCAqL1xyXG4gICAgcHJpdmF0ZSBfc3BlZWNoVm9pY2UgOiBzdHJpbmcgPSAnJztcclxuICAgIC8qKiBJbXB1bHNlIHJlc3BvbnNlIHRvIHVzZSBmb3IgVk9YJ3MgcmV2ZXJiICovXHJcbiAgICBwcml2YXRlIF92b3hSZXZlcmIgICA6IHN0cmluZyA9ICdpci5zdGFsYmFucy53YXYnO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGEgdm9pY2UgbmFtZS4gQmVjYXVzZSBvZiB0aGUgYXN5bmMgbmF0dXJlIG9mXHJcbiAgICAgKiBnZXRWb2ljZXMsIHRoZSBkZWZhdWx0IHZhbHVlIHdpbGwgYmUgZmV0Y2hlZCBmcm9tIGl0IGVhY2ggdGltZS5cclxuICAgICAqL1xyXG4gICAgZ2V0IHNwZWVjaFZvaWNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICAvLyBJZiB0aGVyZSdzIGEgdXNlci1kZWZpbmVkIHZhbHVlLCB1c2UgdGhhdFxyXG4gICAgICAgIGlmICh0aGlzLl9zcGVlY2hWb2ljZSAhPT0gJycpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zcGVlY2hWb2ljZTtcclxuXHJcbiAgICAgICAgLy8gU2VsZWN0IEVuZ2xpc2ggdm9pY2VzIGJ5IGRlZmF1bHRcclxuICAgICAgICBsZXQgdm9pY2VzID0gUkFHLnNwZWVjaC5icm93c2VyVm9pY2VzO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBuYW1lIGluIHZvaWNlcylcclxuICAgICAgICBpZiAgKHZvaWNlc1tuYW1lXS5sYW5nID09PSAnZW4tR0InIHx8IHZvaWNlc1tuYW1lXS5sYW5nID09PSAnZW4tVVMnKVxyXG4gICAgICAgICAgICByZXR1cm4gbmFtZTtcclxuXHJcbiAgICAgICAgLy8gRWxzZSwgZmlyc3Qgdm9pY2Ugb24gdGhlIGxpc3RcclxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXModm9pY2VzKVswXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY2hvaWNlIG9mIHNwZWVjaCB0byB1c2UsIGFzIHZvaWNlIG5hbWUgKi9cclxuICAgIHNldCBzcGVlY2hWb2ljZSh2YWx1ZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NwZWVjaFZvaWNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGltcHVsc2UgcmVzcG9uc2UgZmlsZSB0byB1c2UgZm9yIFZPWCBlbmdpbmUncyByZXZlcmIgKi9cclxuICAgIGdldCB2b3hSZXZlcmIoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIC8vIFJlc2V0IGNob2ljZSBvZiByZXZlcmIgaWYgaXQncyBpbnZhbGlkXHJcbiAgICAgICAgbGV0IGNob2ljZXMgPSBPYmplY3Qua2V5cyhWb3hFbmdpbmUuUkVWRVJCUyk7XHJcblxyXG4gICAgICAgIGlmICggIWNob2ljZXMuaW5jbHVkZXModGhpcy5fdm94UmV2ZXJiKSApXHJcbiAgICAgICAgICAgIHRoaXMuX3ZveFJldmVyYiA9IGNob2ljZXNbMF07XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLl92b3hSZXZlcmI7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGltcHVsc2UgcmVzcG9uc2UgZmlsZSB0byB1c2UgZm9yIFZPWCBlbmdpbmUncyByZXZlcmIgKi9cclxuICAgIHNldCB2b3hSZXZlcmIodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl92b3hSZXZlcmIgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoYXV0b0xvYWQ6IGJvb2xlYW4gPSBmYWxzZSlcclxuICAgIHtcclxuICAgICAgICBzdXBlcihDb25maWcpO1xyXG5cclxuICAgICAgICBpZiAoYXV0b0xvYWQpXHJcbiAgICAgICAgICAgIHRoaXMubG9hZCgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xuXG5pbnRlcmZhY2UgRGFzaFN0ZXBcbntcbiAgICB0eXBlOiAnYW5ub3VuY2VtZW50JyB8ICd3YWl0JztcbiAgICBzdGF0ZUpzb24/OiBzdHJpbmc7XG4gICAgZ2FwTXM6IG51bWJlcjtcbiAgICB3YWl0U2Vjb25kcz86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIERhc2hTY2VuYXJpb1xue1xuICAgIGlkOiBzdHJpbmc7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHN0ZXBzOiBEYXNoU3RlcFtdO1xuICAgIGxvb3BDb3VudDogbnVtYmVyO1xuICAgIGNyZWF0ZWRBdDogbnVtYmVyO1xuICAgIHVwZGF0ZWRBdDogbnVtYmVyO1xufVxuXG5jbGFzcyBTY2VuYXJpb0Rhc2hib2FyZFxue1xuICAgIHByaXZhdGUgc3RvcmFnZUtleSA9ICdyYWcuc2NlbmFyaW9zJztcbiAgICBwcml2YXRlIHNjZW5hcmlvczogRGFzaFNjZW5hcmlvW10gPSBbXTtcbiAgICBwcml2YXRlIGN1cnJlbnRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgLyoqIFRydWUgd2hpbGUgdGhlIHN0ZXAgZWRpdG9yIHZpZXcgaXMgb3BlbiAoYSBzdGVwIGlzIGJlaW5nIGVkaXRlZCkgKi9cbiAgICBwdWJsaWMgZWRpdGluZyA9IGZhbHNlO1xuICAgIC8qKiBTZXJpYWxpemVkIHN0YXRlIGFzIGl0IHdhcyB3aGVuIGVkaXRpbmcgYmVnYW47IG51bGwgd2hlbiBub3QgZWRpdGluZy4gRGlmZmVycyBmcm9tIHRoZSBsaXZlIHN0YXRlIHdoaWxlIHRoZSBlZGl0b3IgaXMgZGlydHkgKi9cbiAgICBwcml2YXRlIGVkaXRTbmFwc2hvdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSBwYW5lbDogSFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBwcm9ncmVzc1RleHRFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIHByb2dyZXNzRmlsbEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgIC8qKiBJbm5lciBzcGFuIG9mIHRoZSBub3ctcGxheWluZyBsaW5lICh0aGUgc2Nyb2xsIHRhcmdldCkgKi9cbiAgICBwcml2YXRlIG5vd1BsYXlpbmdTcGFuOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgIC8qKiByQUYgaGFuZGxlIG9mIHRoZSBydW5uaW5nIG5vdy1wbGF5aW5nIHNjcm9sbCwgMCB3aGVuIGlkbGUgKi9cbiAgICBwcml2YXRlIG5vd1BsYXlpbmdUaW1lcjogbnVtYmVyID0gMDtcbiAgICAvKiogQ3VycmVudCB4IG9mZnNldCAocHgpIG9mIHRoZSBub3ctcGxheWluZyBzY3JvbGwgKi9cbiAgICBwcml2YXRlIG5vd1BsYXlpbmdPZmZzZXQ6IG51bWJlciA9IDA7XG5cbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxuICAgIHtcbiAgICAgICAgdGhpcy5wYW5lbCA9IERPTS5yZXF1aXJlKCcjc2NlbmFyaW9EYXNoYm9hcmQnKTtcbiAgICAgICAgdGhpcy5sb2FkQWxsKCk7XG5cbiAgICAgICAgLy8gUmVzdG9yZSB0aGUgbGFzdCBzZWxlY3RlZCBzY2VuYXJpbywgb3IgZGVmYXVsdCB0byB0aGUgZmlyc3Qgb25lXG4gICAgICAgIGxldCBzYXZlZElkID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3JhZy5jdXJyZW50U2NlbmFyaW9JZCcpO1xuICAgICAgICBpZiAoc2F2ZWRJZCAmJiB0aGlzLnNjZW5hcmlvcy5zb21lKHMgPT4gcy5pZCA9PT0gc2F2ZWRJZCkpXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRJZCA9IHNhdmVkSWQ7XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuc2NlbmFyaW9zLmxlbmd0aCA+IDApXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRJZCA9IHRoaXMuc2NlbmFyaW9zWzBdLmlkO1xuXG4gICAgICAgIFJBRy5zY2VuYXJpby5vblN0ZXAgPSAoaWR4OiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoaWR4LCB0b3RhbCk7XG4gICAgICAgICAgICB0aGlzLmhpZ2hsaWdodFN0ZXAoaWR4KTtcbiAgICAgICAgfTtcblxuICAgICAgICBSQUcuc2NlbmFyaW8ub25Db21wbGV0ZSA9ICgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMub25QbGF5YmFja0VuZGVkKCk7XG4gICAgICAgICAgICB0aGlzLnNldE5vd1BsYXlpbmcoJ1NjZW5hcmlvIGZpbmlzaGVkLicsIHRydWUpO1xuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdTY2VuYXJpbyBmaW5pc2hlZC4nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBSQUcuc2NlbmFyaW8ub25FcnJvciA9IChtc2c6IHN0cmluZykgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5vblBsYXliYWNrRW5kZWQoKTtcbiAgICAgICAgICAgIGFsZXJ0KCdTY2VuYXJpbyBlcnJvcjogJyArIG1zZyk7XG4gICAgICAgICAgICB0aGlzLnNldE5vd1BsYXlpbmcoJ1NjZW5hcmlvIHN0b3BwZWQ6ICcgKyBtc2csIGZhbHNlKTtcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCgnU2NlbmFyaW8gc3RvcHBlZDogJyArIG1zZywgZmFsc2UpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFRoZSBwYW5lbCBjb3ZlcnMgdGhlIG1haW4gc2NyZWVuLCBzbyBtaXJyb3Igd2hhdCBpcyBiZWluZ1xuICAgICAgICAvLyBhbm5vdW5jZWQgKGFuZCBhbnkgd2FpdCBjb3VudGRvd24pIGluc2lkZSBpdC5cbiAgICAgICAgUkFHLnNjZW5hcmlvLm9uVGV4dFVwZGF0ZSA9ICh0ZXh0OiBzdHJpbmcpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuc2V0Tm93UGxheWluZyh0ZXh0KTtcbiAgICAgICAgfTtcblxuICAgICAgICBSQUcuc2NlbmFyaW8ub25XYWl0Q291bnRkb3duID0gKHJlbWFpbmluZzogbnVtYmVyKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnNldE5vd1BsYXlpbmcoJ1dhaXRpbmcgJyArIHJlbWFpbmluZyArICdzLi4uJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gQW5vdGhlciB0YWIgKG9yIHRoaXMgdGFiJ3Mgb3duIHRvb2xiYXIpIG1heSBoYXZlIHdyaXR0ZW4gbmV3ZXJcbiAgICAgICAgLy8gc2NlbmFyaW9zOyByZS1yZWFkIHRoZW0gc28gdGhlIHBhbmVsIG5ldmVyIGNsb2JiZXJzIHRoZW0uXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzdG9yYWdlJywgKGU6IFN0b3JhZ2VFdmVudCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAncmFnLnNjZW5hcmlvcycgfHwgZS5rZXkgPT09ICdyYWcuY3VycmVudFNjZW5hcmlvSWQnKVxuICAgICAgICAgICAgICAgIHRoaXMucmVmcmVzaCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNob3dzIHRoZSBkYXNoYm9hcmQgdmlldyDigJQgcGFuZWwgdXAsIGVkaXRvciBoaWRkZW4uIENhbGxlZCBhdCBib290XG4gICAgICogd2hlbiB0aGlzIHBhZ2UgaXMgcnVubmluZyBpbiB0aGUgZGFzaGJvYXJkIHJvbGU6IHRoZSBkYXNoYm9hcmQgaXNcbiAgICAgKiB0aGUgZGVmYXVsdCBlbnRyeSB2aWV3LCBhbmQgdGhlIGVkaXRvciBhcHBlYXJzIG9ubHkgb24gRWRpdC5cbiAgICAgKi9cbiAgICBwdWJsaWMgb3BlbigpOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnNob3dEYXNoYm9hcmQoKTtcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBPcGVucyB0aGUgc3RlcCBlZGl0b3IgdmlldzogaGlkZXMgdGhlIHBhbmVsIHNvIHRoZSBwaHJhc2UgZWRpdG9yIG9uXG4gICAgICogdGhpcyBzYW1lIGRhc2hib2FyZCBwYWdlIGlzIHJldmVhbGVkIHdpdGggaXRzIHRvb2xiYXIuIFRoZSBwYW5lbCdzXG4gICAgICogUGxheS9TdG9wIGFyZSB0aGUgc2NlbmFyaW8gdHJpZ2dlcnM7IHRoZSB0b29sYmFyJ3MgUGxheS9TdG9wIHNwZWFrXG4gICAgICogdGhlIHNpbmdsZSBhbm5vdW5jZW1lbnQgYmVpbmcgZWRpdGVkLlxuICAgICAqL1xuICAgIHB1YmxpYyBvcGVuRWRpdCgpOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnNob3dFZGl0b3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbG9zZXMgdGhlIHN0ZXAgZWRpdG9yIHZpZXc6IHJlLXNob3dzIHRoZSBkYXNoYm9hcmQgcGFuZWwgYW5kXG4gICAgICogcmUtcmVhZHMgdGhlIHNjZW5hcmlvcyBzbyBhbnl0aGluZyBzYXZlZCBmcm9tIHRoZSBlZGl0b3IgaXNcbiAgICAgKiByZWZsZWN0ZWQuXG4gICAgICovXG4gICAgcHVibGljIGNsb3NlRWRpdCgpOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnNob3dEYXNoYm9hcmQoKTtcbiAgICAgICAgdGhpcy5yZWZyZXNoKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2xvc2UgcmVxdWVzdCBmcm9tIHRoZSBlZGl0b3IncyDinJUgYnV0dG9uIG9yIEVTQzogY2xvc2VzIHN0cmFpZ2h0XG4gICAgICogYXdheSBpZiB0aGUgc3RlcCBiZWluZyBlZGl0ZWQgaGFzIG5vIHVuc2F2ZWQgY2hhbmdlcywgYW5kIGFza3MgdGhlXG4gICAgICogdXNlciBmaXJzdCBvdGhlcndpc2Ug4oCUIGNsb3Npbmcgd291bGQgZGlzY2FyZCB3aGF0IHRoZXkgY2hhbmdlZC5cbiAgICAgKi9cbiAgICBwdWJsaWMgcmVxdWVzdENsb3NlKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICh0aGlzLmlzRGlydHkoKSAmJiAhY29uZmlybSgnRGlzY2FyZCB1bnNhdmVkIGNoYW5nZXM/JykpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHRoaXMuY2xvc2VFZGl0KCk7XG4gICAgfVxuXG4gICAgLyoqIFRydWUgaWYgdGhlIGFubm91bmNlbWVudCBpbiB0aGUgZWRpdG9yIGRpZmZlcnMgZnJvbSB0aGUgc3RhdGUgdGhlIHN0ZXAgYmVpbmcgZWRpdGVkIGhlbGQgd2hlbiBpdCB3YXMgb3BlbmVkICovXG4gICAgcHVibGljIGlzRGlydHkoKTogYm9vbGVhblxuICAgIHtcbiAgICAgICAgaWYgKHRoaXMuZWRpdFNuYXBzaG90ID09PSBudWxsKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKSAhPT0gdGhpcy5lZGl0U25hcHNob3Q7XG4gICAgfVxuXG4gICAgLyoqIFN3aXRjaGVzIHRvIHRoZSBkYXNoYm9hcmQgdmlldzogcGFuZWwgdXAsIGVkaXRvciBoaWRkZW4gKi9cbiAgICBwcml2YXRlIHNob3dEYXNoYm9hcmQoKTogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5lZGl0aW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZWRpdFNuYXBzaG90ID0gbnVsbDtcbiAgICAgICAgdGhpcy5wYW5lbC5oaWRkZW4gPSBmYWxzZTtcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKiogU3dpdGNoZXMgdG8gdGhlIHN0ZXAgZWRpdG9yIHZpZXc6IGVkaXRvciB1cCwgcGFuZWwgaGlkZGVuICovXG4gICAgcHJpdmF0ZSBzaG93RWRpdG9yKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuZWRpdGluZyA9IHRydWU7XG4gICAgICAgIHRoaXMucGFuZWwuaGlkZGVuID0gdHJ1ZTtcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmUtcmVhZHMgc2NlbmFyaW9zIGZyb20gbG9jYWxTdG9yYWdlIGFuZCByZS1yZW5kZXJzLiBDYWxsZWQgYWZ0ZXJcbiAgICAgKiBhbnl0aGluZyB3cml0ZXMgdGhlIHNjZW5hcmlvcyBvdXQgZnJvbSB1bmRlciB0aGlzIGluc3RhbmNlJ3MgaW4tXG4gICAgICogbWVtb3J5IGNvcHkgKHRoZSB0b29sYmFyJ3MgQ2FwdHVyZS9VcGRhdGUgU3RlcCBidXR0b25zLCBhbm90aGVyIHRhYikuXG4gICAgICovXG4gICAgcHVibGljIHJlZnJlc2goKTogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5sb2FkQWxsKCk7XG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50KCkpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudElkID0gdGhpcy5zY2VuYXJpb3MubGVuZ3RoID4gMCA/IHRoaXMuc2NlbmFyaW9zWzBdLmlkIDogbnVsbDtcbiAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZClcbiAgICAgICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgncmFnLmN1cnJlbnRTY2VuYXJpb0lkJywgdGhpcy5jdXJyZW50SWQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlcyB0aGUgXCJub3cgcGxheWluZ1wiIGxpbmUgaW5zaWRlIHRoZSBwYW5lbCwgc2Nyb2xsaW5nIHRoZSB0ZXh0XG4gICAgICogdGhyb3VnaCBpdCBsaWtlIHRoZSBtYWluIG1hcnF1ZWUgKHRoZSBwYW5lbCBjb3ZlcnMgI21hcnF1ZWUsIHNvIHRoaXNcbiAgICAgKiBsaW5lIGlzIHdoYXQgaXMgYWN0dWFsbHkgdmlzaWJsZSBkdXJpbmcgcGxheWJhY2spLiBXaGlsZSBhIHNjcm9sbCBpc1xuICAgICAqIGFscmVhZHkgcnVubmluZywgbmV3IHRleHQgc2ltcGx5IHN3YXBzIGluIHdpdGhvdXQgcmVzdGFydGluZywgc28gdGhlXG4gICAgICogd2FpdCBjb3VudGRvd24gdGlja3Mgc21vb3RobHkgaW5zdGVhZCBvZiBqdW1waW5nIHRvIHRoZSByaWdodCBlZGdlLlxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0Tm93UGxheWluZyh0ZXh0OiBzdHJpbmcsIGFuaW1hdGU6IGJvb2xlYW4gPSB0cnVlKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IGVsID0gdGhpcy5wYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaE5vd1BsYXlpbmcnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmICghZWwpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgbGV0IHNwYW4gPSBlbC5xdWVyeVNlbGVjdG9yKCdzcGFuJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoIXNwYW4pXG4gICAgICAgIHtcbiAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gJyc7XG4gICAgICAgICAgICBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgZWwuYXBwZW5kQ2hpbGQoc3Bhbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3BhbiAhPT0gdGhpcy5ub3dQbGF5aW5nU3BhbilcbiAgICAgICAge1xuICAgICAgICAgICAgLy8gVGhlIHBhbmVsIHdhcyByZS1yZW5kZXJlZCAobmV3IHNwYW4pOiBkcm9wIGFueSBydW5uaW5nIHNjcm9sbFxuICAgICAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMubm93UGxheWluZ1RpbWVyKTtcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gMDtcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1NwYW4gPSBzcGFuO1xuICAgICAgICB9XG5cbiAgICAgICAgc3Bhbi50ZXh0Q29udGVudCA9IHRleHQ7XG5cbiAgICAgICAgaWYgKCFhbmltYXRlKVxuICAgICAgICB7XG4gICAgICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5ub3dQbGF5aW5nVGltZXIpO1xuICAgICAgICAgICAgdGhpcy5ub3dQbGF5aW5nVGltZXIgPSAwO1xuICAgICAgICAgICAgc3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm5vd1BsYXlpbmdUaW1lciAhPT0gMClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAvLyBTYW1lIG1lY2hhbmljcyBhcyBNYXJxdWVlLnNldDogZW50ZXIgZnJvbSB0aGUgcmlnaHQsIGV4aXQgbGVmdCxcbiAgICAgICAgLy8gdGhlbiByZXN0IGF0IHRoZSBsZWZ0IGVkZ2VcbiAgICAgICAgdGhpcy5ub3dQbGF5aW5nT2Zmc2V0ID0gZWwuY2xpZW50V2lkdGg7XG4gICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLnNjcm9sbE5vd1BsYXlpbmcoKSk7XG4gICAgfVxuXG4gICAgLyoqIE9uZSBmcmFtZSBvZiB0aGUgbm93LXBsYXlpbmcgc2Nyb2xsICovXG4gICAgcHJpdmF0ZSBzY3JvbGxOb3dQbGF5aW5nKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBzcGFuID0gdGhpcy5ub3dQbGF5aW5nU3BhbjtcbiAgICAgICAgaWYgKCFzcGFuIHx8ICFzcGFuLnBhcmVudE5vZGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gMDtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubm93UGxheWluZ09mZnNldCAtPSA2O1xuICAgICAgICBzcGFuLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGVYKCR7dGhpcy5ub3dQbGF5aW5nT2Zmc2V0fXB4KWA7XG5cbiAgICAgICAgbGV0IGxpbWl0ID0gLXNwYW4uY2xpZW50V2lkdGggLSAxMDA7XG4gICAgICAgIGlmICh0aGlzLm5vd1BsYXlpbmdPZmZzZXQgPCBsaW1pdClcbiAgICAgICAge1xuICAgICAgICAgICAgLy8gVGhlIHdob2xlIG1lc3NhZ2UgaGFzIHBhc3NlZDogbGV0IGl0IHJlc3QgYXQgdGhlIGxlZnQgZWRnZVxuICAgICAgICAgICAgc3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMubm93UGxheWluZ1RpbWVyID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLnNjcm9sbE5vd1BsYXlpbmcoKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGxvYWRBbGwoKTogdm9pZFxuICAgIHtcbiAgICAgICAgdHJ5XG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCByYXcgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSh0aGlzLnN0b3JhZ2VLZXkpO1xuICAgICAgICAgICAgbGV0IHBhcnNlZCA9IHJhdyA/IEpTT04ucGFyc2UocmF3KSBhcyBEYXNoU2NlbmFyaW9bXSA6IFtdO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHBhcnNlZCkpXG4gICAgICAgICAgICAgICAgcGFyc2VkID0gW107XG4gICAgICAgICAgICB0aGlzLnNjZW5hcmlvcyA9IHBhcnNlZDtcbiAgICAgICAgICAgIHRoaXMuc2NlbmFyaW9zLmZvckVhY2goc2MgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBpZiAoc2Muc3RlcHMpXG4gICAgICAgICAgICAgICAgICAgIHNjLnN0ZXBzLmZvckVhY2goc3QgPT4gdGhpcy5jbGVhblN0ZXAoc3QpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnNjZW5hcmlvcyA9IFtdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RyaXBzIGZpZWxkcyB0aGUgYXBwIG5vIGxvbmdlciB1c2VzIChicmFuY2hpbmcgYW5kIHN0ZXAgbGFiZWxzLFxuICAgICAqIHJlbW92ZWQgMjAyNi0xMS0xNCkgc28gb2xkIHNhdmVzIGFuZCBpbXBvcnRzIHN0YXkgY2xlYW4uXG4gICAgICovXG4gICAgcHJpdmF0ZSBjbGVhblN0ZXAoc3Q6IGFueSk6IHZvaWRcbiAgICB7XG4gICAgICAgIGRlbGV0ZSBzdC5icmFuY2hlcztcbiAgICAgICAgZGVsZXRlIHN0LmJyYW5jaDtcbiAgICAgICAgZGVsZXRlIHN0LmxhYmVsO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2F2ZUFsbCgpOiB2b2lkXG4gICAge1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSh0aGlzLnN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KHRoaXMuc2NlbmFyaW9zKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjdXJyZW50KCk6IERhc2hTY2VuYXJpbyB8IG51bGxcbiAgICB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5hcmlvcy5maW5kKHMgPT4gcy5pZCA9PT0gdGhpcy5jdXJyZW50SWQpIHx8IG51bGw7XG4gICAgfVxuXG4gICAgLyoqIEVzY2FwZXMgdXNlci1lbnRlcmVkIHRleHQgYmVmb3JlIGl0IGlzIGludGVycG9sYXRlZCBpbnRvIEhUTUwgKi9cbiAgICBwcml2YXRlIGVzYyh2OiBzdHJpbmcpOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIHJldHVybiB2LnJlcGxhY2UoLyYvZywgJyZhbXA7JykucmVwbGFjZSgvPC9nLCAnJmx0OycpLnJlcGxhY2UoLz4vZywgJyZndDsnKS5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7Jyk7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSAIFBsYXliYWNrIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgcHJpdmF0ZSBzdGFydFBsYXliYWNrKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgIGlmICghcyB8fCBzLnN0ZXBzLmxlbmd0aCA9PT0gMClcbiAgICAgICAge1xuICAgICAgICAgICAgYWxlcnQoJ1RoaXMgc2NlbmFyaW8gaGFzIG5vIHN0ZXBzIHlldC4gQ2FwdHVyZSBvciBhZGQgc29tZSBmaXJzdC4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2V0RWRpdGluZ0VuYWJsZWQoZmFsc2UpO1xuXG4gICAgICAgIFJBRy5zY2VuYXJpby5jbGVhcigpO1xuICAgICAgICBSQUcuc2NlbmFyaW8uc2V0U3RlcHMocy5zdGVwcyBhcyBhbnkpO1xuICAgICAgICBSQUcuc2NlbmFyaW8uc2V0TG9vcENvdW50KHMubG9vcENvdW50KTtcbiAgICAgICAgUkFHLnNjZW5hcmlvLnBsYXkoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0b3BQbGF5YmFjaygpOiB2b2lkXG4gICAge1xuICAgICAgICBSQUcuc2NlbmFyaW8uc3RvcCgpO1xuICAgICAgICB0aGlzLm9uUGxheWJhY2tFbmRlZCgpO1xuICAgICAgICB0aGlzLnNldE5vd1BsYXlpbmcoJ1BsYXliYWNrIHN0b3BwZWQuJywgZmFsc2UpO1xuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ1BsYXliYWNrIHN0b3BwZWQuJyk7XG4gICAgfVxuXG4gICAgLyoqIFBsYXlzIGEgc2luZ2xlIHN0ZXAgb25jZSAoYW5ub3VuY2VtZW50IG9yIHdhaXQpLCB0aGVuIHN0b3BzICovXG4gICAgcHJpdmF0ZSBwbGF5U3RlcE9ubHkoaWR4OiBudW1iZXIpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICBpZiAoIXMgfHwgIXMuc3RlcHNbaWR4XSlcbiAgICAgICAge1xuICAgICAgICAgICAgYWxlcnQoJ1RoaXMgc2NlbmFyaW8gaGFzIG5vIHN0ZXBzIHlldC4gQ2FwdHVyZSBvciBhZGQgc29tZSBmaXJzdC4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2V0RWRpdGluZ0VuYWJsZWQoZmFsc2UpO1xuXG4gICAgICAgIFJBRy5zY2VuYXJpby5jbGVhcigpO1xuICAgICAgICBSQUcuc2NlbmFyaW8uc2V0U3RlcHMocy5zdGVwcyBhcyBhbnkpO1xuICAgICAgICBSQUcuc2NlbmFyaW8ucGxheVN0ZXAoaWR4KTtcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdQbGF5aW5nIHN0ZXAgJyArIChpZHggKyAxKSArICcgb25seS4nKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uUGxheWJhY2tFbmRlZCgpOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnNldEVkaXRpbmdFbmFibGVkKHRydWUpO1xuICAgICAgICB0aGlzLmhpZ2hsaWdodFN0ZXAoLTEpO1xuICAgICAgICB0aGlzLnVwZGF0ZVByb2dyZXNzKC0xLCAwKTtcbiAgICAgICAgdGhpcy5zZXROb3dQbGF5aW5nKCdJZGxlJywgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKiBMb2NrcyB0aGlzIHRhYidzIG93biBtYWluIHNjcmVlbiB3aGlsZSBhIHNjZW5hcmlvIGlzIHBsYXlpbmcgKi9cbiAgICBwcml2YXRlIHNldEVkaXRpbmdFbmFibGVkKG9uOiBib29sZWFuKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKFJBRy52aWV3cylcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYWluLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBvbiA/ICcnIDogJ25vbmUnO1xuXG4gICAgICAgIGxldCB0b29sYmFyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Rvb2xiYXInKTtcbiAgICAgICAgaWYgKHRvb2xiYXIpXG4gICAgICAgICAgICB0b29sYmFyLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBvbiA/ICcnIDogJ25vbmUnO1xuICAgIH1cblxuICAgIC8vIOKUgOKUgCBQcm9ncmVzcyBhbmQgaGlnaGxpZ2h0IOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgcHJpdmF0ZSB1cGRhdGVQcm9ncmVzcyhpZHg6IG51bWJlciwgdG90YWw6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICghdGhpcy5wcm9ncmVzc1RleHRFbCB8fCAhdGhpcy5wcm9ncmVzc0ZpbGxFbClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAoaWR4IDwgMClcbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5wcm9ncmVzc1RleHRFbC50ZXh0Q29udGVudCA9ICdJZGxlJztcbiAgICAgICAgICAgIHRoaXMucHJvZ3Jlc3NGaWxsRWwuc3R5bGUud2lkdGggPSAnMCUnO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHBjdCA9IHRvdGFsID4gMCA/IE1hdGgucm91bmQoKChpZHggKyAxKSAvIHRvdGFsKSAqIDEwMCkgOiAwO1xuICAgICAgICB0aGlzLnByb2dyZXNzVGV4dEVsLnRleHRDb250ZW50ID0gJ1N0ZXAgJyArIChpZHggKyAxKSArICcgb2YgJyArIHRvdGFsO1xuICAgICAgICB0aGlzLnByb2dyZXNzRmlsbEVsLnN0eWxlLndpZHRoID0gcGN0ICsgJyUnO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGlnaGxpZ2h0U3RlcChpZHg6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMucGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtc3RlcCcpLmZvckVhY2goKGVsLCBpKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBlbC5jbGFzc0xpc3QudG9nZ2xlKCdydW5uaW5nJywgaSA9PT0gaWR4KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSAIFJlbmRlcmluZyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuICAgIHB1YmxpYyByZW5kZXIoKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcblxuICAgICAgICBsZXQgbGlzdEh0bWwgPSB0aGlzLnNjZW5hcmlvcy5tYXAoc2MgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IGNscyA9IHNjLmlkID09PSB0aGlzLmN1cnJlbnRJZCA/ICdkYXNoLXNjZW4gYWN0aXZlJyA6ICdkYXNoLXNjZW4nO1xuICAgICAgICAgICAgcmV0dXJuIGA8bGkgY2xhc3M9XCIke2Nsc31cIiBkYXRhLWlkPVwiJHt0aGlzLmVzYyhzYy5pZCl9XCI+JHt0aGlzLmVzYyhzYy5uYW1lKX0gPHNwYW4gY2xhc3M9XCJkYXNoLXNjZW4tbWV0YVwiPiR7c2Muc3RlcHMubGVuZ3RofSBzdGVwczwvc3Bhbj48L2xpPmA7XG4gICAgICAgIH0pLmpvaW4oJycpO1xuXG4gICAgICAgIGxldCBzdGVwc0h0bWwgPSAnJztcbiAgICAgICAgaWYgKHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBzYyA9IHM7XG4gICAgICAgICAgICBzdGVwc0h0bWwgPSBzYy5zdGVwcy5tYXAoKHN0LCBpKSA9PiB0aGlzLnN0ZXBIdG1sKHNjLCBzdCwgaSkpLmpvaW4oJycpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wYW5lbC5pbm5lckhUTUwgPVxuICAgICAgICBgPGRpdiBjbGFzcz1cImRhc2hcIj5cbiAgICAgICAgICAgIDxoMT5TY2VuYXJpbyBEYXNoYm9hcmQ8L2gxPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcm93IGRhc2gtaGVhZFwiPlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoU2V0dGluZ3NcIiB0eXBlPVwiYnV0dG9uXCIgdGl0bGU9XCJPcGVuIHRoZSBzZXR0aW5ncyBzY3JlZW5cIj5TZXR0aW5nczwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoT3BlbkRpc3BsYXlcIiB0eXBlPVwiYnV0dG9uXCIgdGl0bGU9XCJPcGVuIHRoZSBhbm5vdW5jZW1lbnQgZGlzcGxheSAoc2NyZWVuLmh0bWwpIGluIGEgbmV3IHRhYlwiPk9wZW4gZGlzcGxheTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDxoMj5TY2VuYXJpb3M8L2gyPlxuICAgICAgICAgICAgPHVsPiR7bGlzdEh0bWx9PC91bD5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkYXNoLXJvd1wiPlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJkYXNoTmV3XCIgdHlwZT1cImJ1dHRvblwiPk5ldyBzY2VuYXJpbzwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDxzZWN0aW9uIGNsYXNzPVwiZGFzaC1lZGl0b3JcIj5cbiAgICAgICAgICAgICAgICAke3MgPyB0aGlzLmVkaXRvckh0bWwocywgc3RlcHNIdG1sKSA6ICc8cCBjbGFzcz1cImRhc2gtaGludFwiPlNlbGVjdCBhIHNjZW5hcmlvIGFib3ZlLCBvciBjcmVhdGUgYSBuZXcgb25lLjwvcD4nfVxuICAgICAgICAgICAgPC9zZWN0aW9uPlxuICAgICAgICA8L2Rpdj5gO1xuXG4gICAgICAgIHRoaXMucHJvZ3Jlc3NUZXh0RWwgPSB0aGlzLnBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoUHJvZ3Jlc3NUZXh0Jyk7XG4gICAgICAgIHRoaXMucHJvZ3Jlc3NGaWxsRWwgPSB0aGlzLnBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoUHJvZ3Jlc3NGaWxsJyk7XG4gICAgICAgIHRoaXMuYmluZCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZWRpdG9ySHRtbChzOiBEYXNoU2NlbmFyaW8sIHN0ZXBzSHRtbDogc3RyaW5nKTogc3RyaW5nXG4gICAge1xuICAgICAgICBsZXQgc3RlcHNMaXN0ID0gc3RlcHNIdG1sLmxlbmd0aCA+IDBcbiAgICAgICAgICAgID8gc3RlcHNIdG1sXG4gICAgICAgICAgICA6ICc8cCBjbGFzcz1cImRhc2gtaGludFwiPk5vIHN0ZXBzIHlldC4gQ2FwdHVyZSB0aGUgY3VycmVudCBhbm5vdW5jZW1lbnQsIG9yIGFkZCBhIHdhaXQgc3RlcC48L3A+JztcblxuICAgICAgICByZXR1cm4gYDxkaXYgY2xhc3M9XCJkYXNoLXJvd1wiPlxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImRhc2gtZmllbGRcIj5OYW1lIDxpbnB1dCBpZD1cImRhc2hOYW1lXCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7dGhpcy5lc2Mocy5uYW1lKX1cIj48L2xhYmVsPlxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImRhc2gtZmllbGRcIj5Mb29wIGNvdW50IDxpbnB1dCBpZD1cImRhc2hMb29wXCIgdHlwZT1cIm51bWJlclwiIHZhbHVlPVwiJHtzLmxvb3BDb3VudH1cIiBtaW49XCIxXCIgdGl0bGU9XCJIb3cgbWFueSB0aW1lcyB0byByZXBlYXQgdGhlIHdob2xlIHNjZW5hcmlvXCI+PC9sYWJlbD5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcm93XCI+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImRhc2hBZGRTdGVwXCIgdHlwZT1cImJ1dHRvblwiIHRpdGxlPVwiQWRkIHRoZSBjdXJyZW50IGFubm91bmNlbWVudCBhcyBhIHN0ZXBcIj5DYXB0dXJlIHN0ZXA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiZGFzaEFkZFdhaXRcIiB0eXBlPVwiYnV0dG9uXCIgdGl0bGU9XCJBZGQgYSBzaWxlbnQgcGF1c2VcIj5BZGQgd2FpdCBzdGVwPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImRhc2hJbXBvcnRcIiB0eXBlPVwiYnV0dG9uXCI+SW1wb3J0IEpTT048L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiZGFzaEV4cG9ydFwiIHR5cGU9XCJidXR0b25cIj5FeHBvcnQgSlNPTjwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8aDI+U3RlcHM8L2gyPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtc3RlcHNcIj4ke3N0ZXBzTGlzdH08L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkYXNoLXJ1blwiPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkYXNoLW5vd3BsYXlpbmdcIiBpZD1cImRhc2hOb3dQbGF5aW5nXCI+SWRsZTwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkYXNoLXJvd1wiPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiZGFzaFBsYXlcIiB0eXBlPVwiYnV0dG9uXCI+UGxheTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiZGFzaFN0b3BcIiB0eXBlPVwiYnV0dG9uXCI+U3RvcDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkYXNoLXByb2dyZXNzXCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiZGFzaFByb2dyZXNzVGV4dFwiPklkbGU8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkYXNoLXByb2dyZXNzLWJhclwiPjxkaXYgY2xhc3M9XCJkYXNoLXByb2dyZXNzLWZpbGxcIiBpZD1cImRhc2hQcm9ncmVzc0ZpbGxcIj48L2Rpdj48L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PmA7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzdGVwSHRtbChzOiBEYXNoU2NlbmFyaW8sIHN0OiBEYXNoU3RlcCwgaTogbnVtYmVyKTogc3RyaW5nXG4gICAge1xuICAgICAgICBsZXQgdGl0bGUgPSBzdC50eXBlID09PSAnd2FpdCcgPyAoJ1dhaXQgJyArIChzdC53YWl0U2Vjb25kcyB8fCAwKSArICdzJykgOiAoJ1N0ZXAgJyArIChpICsgMSkpO1xuICAgICAgICBsZXQgZ2FwSW5wdXQgPSBzdC50eXBlID09PSAnYW5ub3VuY2VtZW50J1xuICAgICAgICAgICAgPyBgPGxhYmVsIGNsYXNzPVwiZGFzaC1maWVsZFwiPkdhcCAobXMpIDxpbnB1dCBjbGFzcz1cImRhc2gtZ2FwXCIgdHlwZT1cIm51bWJlclwiIGRhdGEtaWR4PVwiJHtpfVwiIHZhbHVlPVwiJHtzdC5nYXBNc31cIiBtaW49XCIwXCIgc3RlcD1cIjEwMFwiIHRpdGxlPVwiUGF1c2UgYWZ0ZXIgdGhpcyBzdGVwLCBpbiBtaWxsaXNlY29uZHNcIj48L2xhYmVsPmBcbiAgICAgICAgICAgIDogJyc7XG4gICAgICAgIGxldCB3YWl0SW5wdXQgPSBzdC50eXBlID09PSAnd2FpdCdcbiAgICAgICAgICAgID8gYDxsYWJlbCBjbGFzcz1cImRhc2gtZmllbGRcIj5XYWl0IChzKSA8aW5wdXQgY2xhc3M9XCJkYXNoLXdhaXRcIiB0eXBlPVwibnVtYmVyXCIgZGF0YS1pZHg9XCIke2l9XCIgdmFsdWU9XCIke3N0LndhaXRTZWNvbmRzIHx8IDB9XCIgbWluPVwiMFwiIHN0ZXA9XCIxXCIgdGl0bGU9XCJTaWxlbnQgcGF1c2UsIGluIHNlY29uZHNcIj48L2xhYmVsPmBcbiAgICAgICAgICAgIDogJyc7XG4gICAgICAgIGxldCBhbm5CdXR0b25zID0gc3QudHlwZSA9PT0gJ2Fubm91bmNlbWVudCdcbiAgICAgICAgICAgID8gYDxidXR0b24gY2xhc3M9XCJkYXNoLWVkaXRcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1pZHg9XCIke2l9XCIgdGl0bGU9XCJPcGVuIHRoaXMgc3RlcCBpbiB0aGUgZWRpdG9yIHRvIGNoYW5nZSBpdFwiPkVkaXQ8L2J1dHRvbj5gXG4gICAgICAgICAgICA6ICcnO1xuXG4gICAgICAgIHJldHVybiBgPGRpdiBjbGFzcz1cImRhc2gtc3RlcFwiIGRhdGEtaWR4PVwiJHtpfVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtc3RlcC10aXRsZVwiPjxzcGFuPiR7dGl0bGV9PC9zcGFuPjwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2gtcm93XCI+XG4gICAgICAgICAgICAgICAgJHtnYXBJbnB1dH1cbiAgICAgICAgICAgICAgICAke3dhaXRJbnB1dH1cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImRhc2gtcm93LWJ0bnNcIj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRhc2gtdXBcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1pZHg9XCIke2l9XCIgdGl0bGU9XCJNb3ZlIHVwXCIgJHtpID09PSAwID8gJ2Rpc2FibGVkJyA6ICcnfT7ihpE8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRhc2gtZG93blwiIHR5cGU9XCJidXR0b25cIiBkYXRhLWlkeD1cIiR7aX1cIiB0aXRsZT1cIk1vdmUgZG93blwiICR7aSA9PT0gcy5zdGVwcy5sZW5ndGggLSAxID8gJ2Rpc2FibGVkJyA6ICcnfT7ihpM8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRhc2gtc3RlcHBsYXlcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1pZHg9XCIke2l9XCIgdGl0bGU9XCJQbGF5IG9ubHkgdGhpcyBzdGVwXCI+4pa2PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICR7YW5uQnV0dG9uc31cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRhc2gtZGVsXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtaWR4PVwiJHtpfVwiIHRpdGxlPVwiRGVsZXRlIHRoaXMgc3RlcFwiPuKclTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5gO1xuICAgIH1cblxuICAgIC8vIOKUgOKUgCBFdmVudCBiaW5kaW5nIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgcHJpdmF0ZSBiaW5kKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBwYW5lbCA9IHRoaXMucGFuZWw7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtc2NlbicpLmZvckVhY2gobGkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGxpIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50SWQgPSAobGkgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ2lkJ10gfHwgbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50SWQpXG4gICAgICAgICAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcuY3VycmVudFNjZW5hcmlvSWQnLCB0aGlzLmN1cnJlbnRJZCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgYnRuU2V0dGluZ3MgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaFNldHRpbmdzJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuU2V0dGluZ3MpXG4gICAgICAgICAgICBidG5TZXR0aW5ncy5vbmNsaWNrID0gKCkgPT4gUkFHLnZpZXdzLnNldHRpbmdzLm9wZW4oKTtcblxuICAgICAgICBsZXQgYnRuT3BlbkRpc3BsYXkgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaE9wZW5EaXNwbGF5JykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAoYnRuT3BlbkRpc3BsYXkpXG4gICAgICAgICAgICBidG5PcGVuRGlzcGxheS5vbmNsaWNrID0gKCkgPT4gd2luZG93Lm9wZW4oJ3NjcmVlbi5odG1sJywgJ19ibGFuaycpO1xuXG4gICAgICAgIGxldCBidG5OZXcgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaE5ldycpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKGJ0bk5ldylcbiAgICAgICAgICAgIGJ0bk5ldy5vbmNsaWNrID0gKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgaWQgPSAnc2NuXycgKyBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2NlbmFyaW9zLnB1c2goeyBpZDogaWQsIG5hbWU6ICdTY2VuYXJpbyAnICsgKHRoaXMuc2NlbmFyaW9zLmxlbmd0aCArIDEpLCBzdGVwczogW10sIGxvb3BDb3VudDogMSwgY3JlYXRlZEF0OiBEYXRlLm5vdygpLCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50SWQgPSBpZDtcbiAgICAgICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgncmFnLmN1cnJlbnRTY2VuYXJpb0lkJywgaWQpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZUFsbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIGxldCBidG5BZGQgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaEFkZFN0ZXAnKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChidG5BZGQpXG4gICAgICAgICAgICBidG5BZGQub25jbGljayA9ICgpID0+IHRoaXMuY2FwdHVyZVN0ZXAoKTtcblxuICAgICAgICBsZXQgYnRuV2FpdCA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoQWRkV2FpdCcpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKGJ0bldhaXQpXG4gICAgICAgICAgICBidG5XYWl0Lm9uY2xpY2sgPSAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFzKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgcy5zdGVwcy5wdXNoKHsgdHlwZTogJ3dhaXQnLCBnYXBNczogMCwgd2FpdFNlY29uZHM6IDMgfSk7XG4gICAgICAgICAgICAgICAgcy51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZUFsbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLXVwJykuZm9yRWFjaChiID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChiIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMubW92ZVN0ZXAoYiBhcyBIVE1MRWxlbWVudCwgLTEpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtZG93bicpLmZvckVhY2goYiA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAoYiBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLm1vdmVTdGVwKGIgYXMgSFRNTEVsZW1lbnQsIDEpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtZGVsJykuZm9yRWFjaChiID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChiIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuZGVsZXRlU3RlcChiIGFzIEhUTUxFbGVtZW50KSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kYXNoLWVkaXQnKS5mb3JFYWNoKGIgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGIgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5lZGl0U3RlcChwYXJzZUludCgoYiBhcyBIVE1MRWxlbWVudCkuZGF0YXNldFsnaWR4J10gfHwgJzAnLCAxMCkpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtc3RlcHBsYXknKS5mb3JFYWNoKGIgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGIgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoKGIgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ2lkeCddIHx8ICcwJywgMTApO1xuICAgICAgICAgICAgICAgIHRoaXMucGxheVN0ZXBPbmx5KGlkeCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtZ2FwJykuZm9yRWFjaChpbnAgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgKGlucCBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoKGlucCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldFsnaWR4J10gfHwgJzAnLCAxMCk7XG4gICAgICAgICAgICAgICAgbGV0IHMgPSB0aGlzLmN1cnJlbnQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBzLnN0ZXBzW2lkeF0uZ2FwTXMgPSBwYXJzZUludCgoaW5wIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlLCAxMCkgfHwgMDtcbiAgICAgICAgICAgICAgICBzLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvckFsbCgnLmRhc2gtd2FpdCcpLmZvckVhY2goaW5wID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIChpbnAgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KChpbnAgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ2lkeCddIHx8ICcwJywgMTApO1xuICAgICAgICAgICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFzKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgcy5zdGVwc1tpZHhdLndhaXRTZWNvbmRzID0gcGFyc2VJbnQoKGlucCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSwgMTApIHx8IDA7XG4gICAgICAgICAgICAgICAgcy51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZUFsbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IG5hbWVJbnB1dCA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNkYXNoTmFtZScpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAobmFtZUlucHV0KVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgZWwgPSBuYW1lSW5wdXQ7XG4gICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFzKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgcy5uYW1lID0gZWwudmFsdWU7XG4gICAgICAgICAgICAgICAgcy51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZUFsbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBsb29wSW5wdXQgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaExvb3AnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKGxvb3BJbnB1dClcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IGVsID0gbG9vcElucHV0O1xuICAgICAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICAgICAgICAgIGlmICghcylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHMubG9vcENvdW50ID0gcGFyc2VJbnQoZWwudmFsdWUsIDEwKSB8fCAxO1xuICAgICAgICAgICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGJ0blBsYXkgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaFBsYXknKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChidG5QbGF5KVxuICAgICAgICAgICAgYnRuUGxheS5vbmNsaWNrID0gKCkgPT4gdGhpcy5zdGFydFBsYXliYWNrKCk7XG5cbiAgICAgICAgbGV0IGJ0blN0b3AgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaFN0b3AnKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChidG5TdG9wKVxuICAgICAgICAgICAgYnRuU3RvcC5vbmNsaWNrID0gKCkgPT4gdGhpcy5zdG9wUGxheWJhY2soKTtcblxuICAgICAgICBsZXQgYnRuRXhwb3J0ID0gcGFuZWwucXVlcnlTZWxlY3RvcignI2Rhc2hFeHBvcnQnKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChidG5FeHBvcnQpXG4gICAgICAgICAgICBidG5FeHBvcnQub25jbGljayA9ICgpID0+IHRoaXMuZXhwb3J0SnNvbigpO1xuXG4gICAgICAgIGxldCBidG5JbXBvcnQgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjZGFzaEltcG9ydCcpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKGJ0bkltcG9ydClcbiAgICAgICAgICAgIGJ0bkltcG9ydC5vbmNsaWNrID0gKCkgPT4gdGhpcy5pbXBvcnRKc29uKCk7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSAIFN0ZXAgb3BlcmF0aW9ucyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuICAgIC8qKlxuICAgICAqIEFkZHMgdGhlIGxpdmUgYW5ub3VuY2VtZW50IGFzIGEgbmV3IHN0ZXAuIFByZWZlcnMgYSBzaWJsaW5nIHRhYidzIHN0YXRlXG4gICAgICogKGFza2VkIGZvciBvdmVyIHRoZSBjaGFubmVsLCBhbnN3ZXJlZCBieSB0aGUgZWRpdG9yIHJvbGUpOyBmYWxscyBiYWNrXG4gICAgICogdG8gdGhpcyB0YWIncyBvd24gc3RhdGUgd2hlbiBubyBvdGhlciB0YWIgYW5zd2VycyB3aXRoaW4gMS4ycyAoaS5lLlxuICAgICAqIGJ1aWxkaW5nIGRpcmVjdGx5IG9uIHRoZSBkYXNoYm9hcmQgcGFnZSkuXG4gICAgICovXG4gICAgcHJpdmF0ZSBjYXB0dXJlU3RlcCgpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgY2FwdHVyZWQgPSBmYWxzZTtcbiAgICAgICAgbGV0IG5vbmNlID0gJ2NhcF8nICsgRGF0ZS5ub3coKSArICdfJyArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApO1xuXG4gICAgICAgIGxldCBoYW5kbGVyID0gKG1zZzogYW55KSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBpZiAoY2FwdHVyZWQgfHwgIW1zZyB8fCBtc2cubm9uY2UgIT09IG5vbmNlIHx8ICFtc2cuc3RhdGVKc29uKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGNhcHR1cmVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmIChSQUcuY2hhbm5lbClcbiAgICAgICAgICAgICAgICBSQUcuY2hhbm5lbC5vZmYoJ0NBUFRVUkVEX1NURVBfREFUQScsIGhhbmRsZXIpO1xuICAgICAgICAgICAgdGhpcy5wdXNoU3RlcChtc2cuc3RhdGVKc29uKTtcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoUkFHLmNoYW5uZWwpXG4gICAgICAgIHtcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLm9uKCdDQVBUVVJFRF9TVEVQX0RBVEEnLCBoYW5kbGVyKTtcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLnNlbmQoJ0NBUFRVUkVfU1RFUF9SRVFVRVNUJywgeyBub25jZTogbm9uY2UgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBpZiAoUkFHLmNoYW5uZWwpXG4gICAgICAgICAgICAgICAgUkFHLmNoYW5uZWwub2ZmKCdDQVBUVVJFRF9TVEVQX0RBVEEnLCBoYW5kbGVyKTtcbiAgICAgICAgICAgIGlmICghY2FwdHVyZWQpXG4gICAgICAgICAgICAgICAgdGhpcy5wdXNoU3RlcChKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpKTtcbiAgICAgICAgfSwgMTIwMCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwdXNoU3RlcChzdGF0ZUpzb246IHN0cmluZyk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBzID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgIGlmICghcylcbiAgICAgICAge1xuICAgICAgICAgICAgYWxlcnQoJ1NlbGVjdCBhIHNjZW5hcmlvIGZpcnN0LicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcy5zdGVwcy5wdXNoKHsgdHlwZTogJ2Fubm91bmNlbWVudCcsIHN0YXRlSnNvbjogc3RhdGVKc29uLCBnYXBNczogMTUwMCB9KTtcbiAgICAgICAgcy51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdDYXB0dXJlZCBzdGVwICcgKyBzLnN0ZXBzLmxlbmd0aCArICcgaW50byBcIicgKyBzLm5hbWUgKyAnXCInKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBPcGVucyB0aGlzIHN0ZXAgaW4gdGhlIHN0ZXAgZWRpdG9yIHZpZXc6IGxvYWRzIGl0cyBhbm5vdW5jZW1lbnQgaW50b1xuICAgICAqIHRoZSBlZGl0b3Igb24gdGhpcyBzYW1lIGRhc2hib2FyZCBwYWdlLCB0aGVuIHJldmVhbHMgaXQgd2l0aCBpdHNcbiAgICAgKiB0b29sYmFyLiBcIlVwZGF0ZSBTdGVwXCIgd3JpdGVzIGJhY2sgdG8gdGhpcyBzdGVwIOKAlCB0aGUga2V5cyBzZXQgYmVsb3dcbiAgICAgKiBhcmUgd2hhdCBpdCB0YXJnZXRzLiBObyBuZXcgdGFiLCBzbyB0aGUgZGFzaGJvYXJkIHRhYiBrZWVwcyBvd25pbmdcbiAgICAgKiB0aGUgYXVkaW8gYW5kIHRoZSB2b2ljZSBpcyBuZXZlciBkb3VibGVkLlxuICAgICAqL1xuICAgIHByaXZhdGUgZWRpdFN0ZXAoaWR4OiBudW1iZXIpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICBpZiAoIXMgfHwgIXMuc3RlcHNbaWR4XSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgbGV0IHN0ZXAgPSBzLnN0ZXBzW2lkeF07XG4gICAgICAgIGlmIChzdGVwLnR5cGUgIT09ICdhbm5vdW5jZW1lbnQnIHx8ICFzdGVwLnN0YXRlSnNvbilcbiAgICAgICAge1xuICAgICAgICAgICAgYWxlcnQoJ1RoaXMgc3RlcCBoYXMgbm8gYW5ub3VuY2VtZW50IHN0YXRlIHRvIGVkaXQuJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgncmFnLmN1cnJlbnRTY2VuYXJpb0lkJywgcy5pZCk7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdyYWcuc2VsZWN0ZWRTdGVwSW5kZXgnLCBTdHJpbmcoaWR4KSk7XG5cbiAgICAgICAgUkFHLmxvYWQoc3RlcC5zdGF0ZUpzb24pO1xuICAgICAgICAvLyBTbmFwc2hvdCBhZnRlciBsb2FkOiB0aGUgZGlydHkgY2hlY2sgY29tcGFyZXMgdGhlIGxpdmUgc3RhdGVcbiAgICAgICAgLy8gYWdhaW5zdCB0aGlzLCBzbyB0aGUgc3RlcCdzIG93biBzdGF0ZSByZWFkcyBhcyBjbGVhbi5cbiAgICAgICAgdGhpcy5lZGl0U25hcHNob3QgPSBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpO1xuICAgICAgICB0aGlzLm9wZW5FZGl0KCk7XG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCgnRWRpdGluZyBzdGVwICcgKyAoaWR4ICsgMSkgKyAnIG9mIFwiJyArIHMubmFtZSArICdcIi4gTWFrZSB5b3VyIGNoYW5nZXMsIHRoZW4gY2xpY2sgXCJVcGRhdGUgU3RlcFwiIHRvIHNhdmUgdGhlbSBiYWNrLicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgbW92ZVN0ZXAoYnRuOiBIVE1MRWxlbWVudCwgZGlyOiBudW1iZXIpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoYnRuLmRhdGFzZXRbJ2lkeCddIHx8ICcwJywgMTApO1xuICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGxldCB0byA9IGlkeCArIGRpcjtcbiAgICAgICAgaWYgKHRvIDwgMCB8fCB0byA+PSBzLnN0ZXBzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBsZXQgdG1wID0gcy5zdGVwc1t0b107XG4gICAgICAgIHMuc3RlcHNbdG9dID0gcy5zdGVwc1tpZHhdO1xuICAgICAgICBzLnN0ZXBzW2lkeF0gPSB0bXA7XG4gICAgICAgIHMudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdGhpcy5zYXZlQWxsKCk7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkZWxldGVTdGVwKGJ0bjogSFRNTEVsZW1lbnQpOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoYnRuLmRhdGFzZXRbJ2lkeCddIHx8ICcwJywgMTApO1xuICAgICAgICBsZXQgcyA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICBpZiAoIXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmICghY29uZmlybSgnRGVsZXRlIHRoaXMgc3RlcD8nKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBzLnN0ZXBzLnNwbGljZShpZHgsIDEpO1xuICAgICAgICBzLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIHRoaXMuc2F2ZUFsbCgpO1xuICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgIH1cblxuICAgIC8vIOKUgOKUgCBJbXBvcnQgLyBleHBvcnQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBwcml2YXRlIGV4cG9ydEpzb24oKTogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh0aGlzLnNjZW5hcmlvcywgbnVsbCwgMik7XG4gICAgICAgIGxldCBibG9iID0gbmV3IEJsb2IoW3BheWxvYWRdLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgbGV0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIGxldCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7XG4gICAgICAgIGEuZG93bmxvYWQgPSAncmFnLXNjZW5hcmlvcy5qc29uJztcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTtcbiAgICAgICAgYS5jbGljaygpO1xuICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGEpO1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpbXBvcnRKc29uKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBpbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XG4gICAgICAgIGlucHV0LnR5cGUgPSAnZmlsZSc7XG4gICAgICAgIGlucHV0LmFjY2VwdCA9ICdhcHBsaWNhdGlvbi9qc29uLCAuanNvbic7XG4gICAgICAgIGlucHV0Lm9uY2hhbmdlID0gYXN5bmMgKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IGZpbGUgPSBpbnB1dC5maWxlcyAmJiBpbnB1dC5maWxlc1swXTtcbiAgICAgICAgICAgIGlmICghZmlsZSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBsZXQgZiA9IGZpbGU7XG5cbiAgICAgICAgICAgIGxldCB0ZXh0ID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nPihyZXNvbHZlID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG4gICAgICAgICAgICAgICAgcmVhZGVyLm9ubG9hZCA9ICgpID0+IHJlc29sdmUocmVhZGVyLnJlc3VsdCBhcyBzdHJpbmcpO1xuICAgICAgICAgICAgICAgIHJlYWRlci5vbmVycm9yID0gKCkgPT4gcmVzb2x2ZSgnJyk7XG4gICAgICAgICAgICAgICAgcmVhZGVyLnJlYWRBc1RleHQoZik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICh0ZXh0ID09PSAnJylcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIHRyeVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxldCBpbXBvcnRlZCA9IEpTT04ucGFyc2UodGV4dCkgYXMgRGFzaFNjZW5hcmlvW107XG4gICAgICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGltcG9ydGVkKSlcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBhbiBhcnJheSBvZiBzY2VuYXJpb3MnKTtcblxuICAgICAgICAgICAgICAgIGltcG9ydGVkLmZvckVhY2goc2MgPT5cbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2MuaWQpXG4gICAgICAgICAgICAgICAgICAgICAgICBzYy5pZCA9ICdzY25fJyArIERhdGUubm93KCkgKyAnXycgKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzYy5zdGVwcylcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjLnN0ZXBzID0gW107XG4gICAgICAgICAgICAgICAgICAgIHNjLnN0ZXBzLmZvckVhY2goc3QgPT4gdGhpcy5jbGVhblN0ZXAoc3QpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzYy5sb29wQ291bnQpXG4gICAgICAgICAgICAgICAgICAgICAgICBzYy5sb29wQ291bnQgPSAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjLmNyZWF0ZWRBdClcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjLmNyZWF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2MudXBkYXRlZEF0KVxuICAgICAgICAgICAgICAgICAgICAgICAgc2MudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHRoaXMuc2NlbmFyaW9zID0gdGhpcy5zY2VuYXJpb3MuY29uY2F0KGltcG9ydGVkKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50SWQgPT09IG51bGwgJiYgdGhpcy5zY2VuYXJpb3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50SWQgPSB0aGlzLnNjZW5hcmlvc1t0aGlzLnNjZW5hcmlvcy5sZW5ndGggLSAxXS5pZDtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVBbGwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCgnSW1wb3J0ZWQgJyArIGltcG9ydGVkLmxlbmd0aCArICcgc2NlbmFyaW8ocykuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBhbGVydCgnSW52YWxpZCBKU09OOiBleHBlY3RlZCBhbiBhcnJheSBvZiBzY2VuYXJpb3MuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGlucHV0LmNsaWNrKCk7XG4gICAgfVxufVxuXG4od2luZG93IGFzIGFueSkuU2NlbmFyaW9EYXNoYm9hcmQgPSBTY2VuYXJpb0Rhc2hib2FyZDtcbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBMYW5ndWFnZSBlbnRyaWVzIGFyZSB0ZW1wbGF0ZSBkZWxlZ2F0ZXMgKi9cclxudHlwZSBMYW5ndWFnZUVudHJ5ID0gKC4uLnBhcnRzOiBzdHJpbmdbXSkgPT4gc3RyaW5nO1xyXG5cclxuLyoqIExhbmd1YWdlIGRlZmluaXRpb25zIGZvciBFbmdsaXNoOyBhbHNvIGFjdHMgYXMgdGhlIGJhc2UgbGFuZ3VhZ2UgKi9cclxuY2xhc3MgRW5nbGlzaExhbmd1YWdlXHJcbntcclxuICAgIFtpbmRleDogc3RyaW5nXSA6IExhbmd1YWdlRW50cnkgfCBzdHJpbmcgfCBzdHJpbmdbXTtcclxuXHJcbiAgICAvLyBSQUdcclxuXHJcbiAgICBXRUxDT01FICAgICAgID0gJ1dlbGNvbWUgdG8gUmFpbCBBbm5vdW5jZW1lbnQgR2VuZXJhdG9yLic7XHJcbiAgICBET01fTUlTU0lORyAgID0gKHE6IGFueSkgPT4gYFJlcXVpcmVkIERPTSBlbGVtZW50IGlzIG1pc3Npbmc6ICcke3F9J2A7XHJcbiAgICBBVFRSX01JU1NJTkcgID0gKGE6IGFueSkgPT4gYFJlcXVpcmVkIGF0dHJpYnV0ZSBpcyBtaXNzaW5nOiAnJHthfSdgO1xyXG4gICAgREFUQV9NSVNTSU5HICA9IChrOiBhbnkpID0+IGBSZXF1aXJlZCBkYXRhc2V0IGtleSBpcyBtaXNzaW5nIG9yIGVtcHR5OiAnJHtrfSdgO1xyXG4gICAgQkFEX0RJUkVDVElPTiA9ICh2OiBhbnkpID0+IGBEaXJlY3Rpb24gbmVlZHMgdG8gYmUgLTEgb3IgMSwgbm90ICcke3Z9J2A7XHJcbiAgICBCQURfQk9PTEVBTiAgID0gKHY6IGFueSkgPT4gYEdpdmVuIHN0cmluZyBkb2VzIG5vdCByZXByZXNlbnQgYSBib29sZWFuOiAnJHt2fSdgO1xyXG5cclxuICAgIC8vIFN0YXRlXHJcblxyXG4gICAgU1RBVEVfRlJPTV9TVE9SQUdFICA9ICdTdGF0ZSBoYXMgYmVlbiBsb2FkZWQgZnJvbSBzdG9yYWdlLic7XHJcbiAgICBTVEFURV9CQURfUEhSQVNFU0VUID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQXR0ZW1wdGVkIHRvIGdldCBjaG9zZW4gaW5kZXggZm9yIHBocmFzZXNldCAoJHtyfSkgdGhhdCBkb2Vzbid0IGV4aXN0LmA7XHJcblxyXG4gICAgLy8gQ29uZmlnXHJcblxyXG4gICAgQ09ORklHX0xPQURfRkFJTCAgPSAobXNnOiBhbnkpID0+IGBDb3VsZCBub3QgbG9hZCBzZXR0aW5nczogJHttc2d9YDtcclxuICAgIENPTkZJR19TQVZFX0ZBSUwgID0gKG1zZzogYW55KSA9PiBgQ291bGQgbm90IHNhdmUgc2V0dGluZ3M6ICR7bXNnfWA7XHJcbiAgICBDT05GSUdfUkVTRVRfRkFJTCA9IChtc2c6IGFueSkgPT4gYENvdWxkIG5vdCBjbGVhciBzZXR0aW5nczogJHttc2d9YDtcclxuXHJcbiAgICAvLyBEYXRhYmFzZVxyXG5cclxuICAgIERCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUgPSAoZTogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDb25maWd1cmVkIHBocmFzZXNldCBlbGVtZW50IHF1ZXJ5ICcke2V9JyBkb2VzIG5vdCBwb2ludCB0byBhbiBpZnJhbWUgZW1iZWQuYDtcclxuXHJcbiAgICBEQl9VTktOT1dOX1NUQVRJT04gICA9IChjOiBhbnkpID0+IGBVTktOT1dOIFNUQVRJT046ICR7Y31gO1xyXG4gICAgREJfRU1QVFlfU1RBVElPTiAgICAgPSAoYzogYW55KSA9PlxyXG4gICAgICAgIGBTdGF0aW9uIGRhdGFiYXNlIGFwcGVhcnMgdG8gY29udGFpbiBhbiBlbXB0eSBuYW1lIGZvciBjb2RlICcke2N9Jy5gO1xyXG4gICAgREJfVE9PX01BTllfU1RBVElPTlMgPSAoKSA9PiAnUGlja2luZyB0b28gbWFueSBzdGF0aW9ucyB0aGFuIHRoZXJlIGFyZSBhdmFpbGFibGUnO1xyXG5cclxuICAgIC8vIFRvb2xiYXJcclxuXHJcbiAgICBUT09MQkFSX1BMQVkgICAgID0gJ1BsYXkgcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU1RPUCAgICAgPSAnU3RvcCBwbGF5aW5nIHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NIVUZGTEUgID0gJ0dlbmVyYXRlIHJhbmRvbSBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TRVRUSU5HUyA9ICdPcGVuIHNldHRpbmdzJztcclxuICAgIFRPT0xCQVJfQ0xPU0UgICAgPSAnQ2xvc2UgdGhlIGVkaXRvciBhbmQgcmV0dXJuIHRvIHRoZSBzY2VuYXJpbyBkYXNoYm9hcmQnO1xyXG5cclxuICAgIC8vIEVkaXRvclxyXG5cclxuICAgIFRJVExFX0NPQUNIICAgICAgID0gKGM6IGFueSkgPT4gYENsaWNrIHRvIGNoYW5nZSB0aGlzIGNvYWNoICgnJHtjfScpYDtcclxuICAgIFRJVExFX0VYQ1VTRSAgICAgID0gJ0NsaWNrIHRvIGNoYW5nZSB0aGlzIGV4Y3VzZSc7XHJcbiAgICBUSVRMRV9JTlRFR0VSICAgICA9IChjOiBhbnkpID0+IGBDbGljayB0byBjaGFuZ2UgdGhpcyBudW1iZXIgKCcke2N9JylgO1xyXG4gICAgVElUTEVfTkFNRUQgICAgICAgPSAnQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW5cXCdzIG5hbWUnO1xyXG4gICAgVElUTEVfT1BUX09QRU4gICAgPSAodDogYW55LCByOiBhbnkpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIG9wZW4gdGhpcyBvcHRpb25hbCAke3R9ICgnJHtyfScpYDtcclxuICAgIFRJVExFX09QVF9DTE9TRSAgID0gKHQ6IGFueSwgcjogYW55KSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjbG9zZSB0aGlzIG9wdGlvbmFsICR7dH0gKCcke3J9JylgO1xyXG4gICAgVElUTEVfUEhSQVNFU0VUICAgPSAocjogYW55KSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhlIHBocmFzZSB1c2VkIGluIHRoaXMgc2VjdGlvbiAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9QTEFURk9STSAgICA9ICdDbGljayB0byBjaGFuZ2UgdGhpcyB0cmFpblxcJ3MgcGxhdGZvcm0nO1xyXG4gICAgVElUTEVfU0VSVklDRSAgICAgPSAoYzogYW55KSA9PiBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc2VydmljZSAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OICAgICA9IChjOiBhbnkpID0+IGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uICgnJHtjfScpYDtcclxuICAgIFRJVExFX1NUQVRJT05MSVNUID0gKGM6IGFueSkgPT4gYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gbGlzdCAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9USU1FICAgICAgICA9IChjOiBhbnkpID0+IGBDbGljayB0byBjaGFuZ2UgdGhpcyB0aW1lICgnJHtjfScpYDtcclxuXHJcbiAgICBFRElUT1JfSU5JVCAgICAgICAgICAgICAgPSAnUGxlYXNlIHdhaXQuLi4nO1xyXG4gICAgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgID0gKG46IGFueSkgPT4gYChVTktOT1dOIFhNTCBFTEVNRU5UOiAke259KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgPSAocjogYW55KSA9PiBgKFVOS05PV04gUEhSQVNFOiAke3J9KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgPSAocjogYW55KSA9PiBgKFVOS05PV04gUEhSQVNFU0VUOiAke3J9KWA7XHJcblxyXG4gICAgLy8gUGhyYXNlclxyXG5cclxuICAgIFBIUkFTRVJfVE9PX1JFQ1VSU0lWRSA9ICdUb28gbWFueSBsZXZlbHMgb2YgcmVjdXJzaW9uIHdoaWxzdCBwcm9jZXNzaW5nIHBocmFzZS4nO1xyXG5cclxuICAgIC8vIFBpY2tlcnNcclxuXHJcbiAgICBIRUFERVJfQ09BQ0ggICAgICAgPSAoYzogYW55KSA9PiBgUGljayBhIGNvYWNoIGxldHRlciBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9FWENVU0UgICAgICA9ICdQaWNrIGFuIGV4Y3VzZSc7XHJcbiAgICBIRUFERVJfSU5URUdFUiAgICAgPSAoYzogYW55KSA9PiBgUGljayBhIG51bWJlciBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9OQU1FRCAgICAgICA9ICdQaWNrIGEgbmFtZWQgdHJhaW4nO1xyXG4gICAgSEVBREVSX1BIUkFTRVNFVCAgID0gKHI6IGFueSkgPT4gYFBpY2sgYSBwaHJhc2UgZm9yIHRoZSAnJHtyfScgc2VjdGlvbmA7XHJcbiAgICBIRUFERVJfUExBVEZPUk0gICAgPSAnUGljayBhIHBsYXRmb3JtJztcclxuICAgIEhFQURFUl9TRVJWSUNFICAgICA9IChjOiBhbnkpID0+IGBQaWNrIGEgc2VydmljZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OICAgICA9IChjOiBhbnkpID0+IGBQaWNrIGEgc3RhdGlvbiBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OTElTVCA9IChjOiBhbnkpID0+IGBCdWlsZCBhIHN0YXRpb24gbGlzdCBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9USU1FICAgICAgICA9IChjOiBhbnkpID0+IGBQaWNrIGEgdGltZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuXHJcbiAgICBQX0dFTkVSSUNfVCAgICAgID0gJ0xpc3Qgb2YgY2hvaWNlcyc7XHJcbiAgICBQX0dFTkVSSUNfUEggICAgID0gJ0ZpbHRlciBjaG9pY2VzLi4uJztcclxuICAgIFBfQ09BQ0hfVCAgICAgICAgPSAnQ29hY2ggbGV0dGVyJztcclxuICAgIFBfRVhDVVNFX1QgICAgICAgPSAnTGlzdCBvZiBkZWxheSBvciBjYW5jZWxsYXRpb24gZXhjdXNlcyc7XHJcbiAgICBQX0VYQ1VTRV9QSCAgICAgID0gJ0ZpbHRlciBleGN1c2VzLi4uJztcclxuICAgIFBfRVhDVVNFX0lURU1fVCAgPSAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgZXhjdXNlJztcclxuICAgIFBfSU5UX1QgICAgICAgICAgPSAnSW50ZWdlciB2YWx1ZSc7XHJcbiAgICBQX05BTUVEX1QgICAgICAgID0gJ0xpc3Qgb2YgdHJhaW4gbmFtZXMnO1xyXG4gICAgUF9OQU1FRF9QSCAgICAgICA9ICdGaWx0ZXIgdHJhaW4gbmFtZS4uLic7XHJcbiAgICBQX05BTUVEX0lURU1fVCAgID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIG5hbWUnO1xyXG4gICAgUF9QU0VUX1QgICAgICAgICA9ICdMaXN0IG9mIHBocmFzZXMnO1xyXG4gICAgUF9QU0VUX1BIICAgICAgICA9ICdGaWx0ZXIgcGhyYXNlcy4uLic7XHJcbiAgICBQX1BTRVRfSVRFTV9UICAgID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHBocmFzZSc7XHJcbiAgICBQX1BMQVRfTlVNQkVSX1QgID0gJ1BsYXRmb3JtIG51bWJlcic7XHJcbiAgICBQX1BMQVRfTEVUVEVSX1QgID0gJ09wdGlvbmFsIHBsYXRmb3JtIGxldHRlcic7XHJcbiAgICBQX1NFUlZfVCAgICAgICAgID0gJ0xpc3Qgb2Ygc2VydmljZSBuYW1lcyc7XHJcbiAgICBQX1NFUlZfUEggICAgICAgID0gJ0ZpbHRlciBzZXJ2aWNlcy4uLic7XHJcbiAgICBQX1NFUlZfSVRFTV9UICAgID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHNlcnZpY2UnO1xyXG4gICAgUF9TVEFUSU9OX1QgICAgICA9ICdMaXN0IG9mIHN0YXRpb24gbmFtZXMnO1xyXG4gICAgUF9TVEFUSU9OX1BIICAgICA9ICdGaWx0ZXIgc3RhdGlvbnMuLi4nO1xyXG4gICAgUF9TVEFUSU9OX0lURU1fVCA9ICdDbGljayB0byBzZWxlY3Qgb3IgYWRkIHRoaXMgc3RhdGlvbic7XHJcbiAgICBQX1NMX0FERCAgICAgICAgID0gJ0FkZCBzdGF0aW9uLi4uJztcclxuICAgIFBfU0xfQUREX1QgICAgICAgPSAnQWRkIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfQ0xPU0UgICAgICAgPSAnQ2xvc2UnO1xyXG4gICAgUF9TTF9DTE9TRV9UICAgICA9ICdDbG9zZSB0aGlzIHBpY2tlcic7XHJcbiAgICBQX1NMX0VNUFRZICAgICAgID0gJ1BsZWFzZSBhZGQgYXQgbGVhc3Qgb25lIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfRFJBR19UICAgICAgPSAnRHJhZ2dhYmxlIHNlbGVjdGlvbiBvZiBzdGF0aW9ucyBmb3IgdGhpcyBsaXN0JztcclxuICAgIFBfU0xfREVMRVRFICAgICAgPSAnRHJvcCBoZXJlIHRvIGRlbGV0ZSc7XHJcbiAgICBQX1NMX0RFTEVURV9UICAgID0gJ0Ryb3Agc3RhdGlvbiBoZXJlIHRvIGRlbGV0ZSBpdCBmcm9tIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0lURU1fVCAgICAgID0gJ0RyYWcgdG8gcmVvcmRlcjsgZG91YmxlLWNsaWNrIG9yIGRyYWcgaW50byBkZWxldGUgem9uZSB0byByZW1vdmUnO1xyXG4gICAgUF9USU1FX1QgICAgICAgICA9ICdUaW1lIGVkaXRvcic7XHJcblxyXG4gICAgLy8gU2V0dGluZ3NcclxuXHJcbiAgICBTVF9SRVNFVCAgICAgICAgICAgPSAnUmVzZXQgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfVCAgICAgICAgID0gJ1Jlc2V0IHNldHRpbmdzIHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk0gICA9ICdBcmUgeW91IHN1cmU/JztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk1fVCA9ICdDb25maXJtIHJlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0RPTkUgICAgICA9ICdTZXR0aW5ncyBoYXZlIGJlZW4gcmVzZXQgdG8gdGhlaXIgZGVmYXVsdHMsIGFuZCBkZWxldGVkIGZyb20nICtcclxuICAgICAgICAnIHN0b3JhZ2UuJztcclxuICAgIFNUX1NBVkUgICAgICAgICAgICA9ICdTYXZlICYgY2xvc2UnO1xyXG4gICAgU1RfU0FWRV9UICAgICAgICAgID0gJ1NhdmUgYW5kIGNsb3NlIHNldHRpbmdzJztcclxuICAgIFNUX1NQRUVDSCAgICAgICAgICA9ICdTcGVlY2gnO1xyXG4gICAgU1RfU1BFRUNIX0NIT0lDRSAgID0gJ1ZvaWNlJztcclxuICAgIFNUX1NQRUVDSF9FTVBUWSAgICA9ICdOb25lIGF2YWlsYWJsZSc7XHJcbiAgICBTVF9TUEVFQ0hfVk9MICAgICAgPSAnVm9sdW1lJztcclxuICAgIFNUX1NQRUVDSF9QSVRDSCAgICA9ICdQaXRjaCc7XHJcbiAgICBTVF9TUEVFQ0hfUkFURSAgICAgPSAnUmF0ZSc7XHJcbiAgICBTVF9TUEVFQ0hfVEVTVCAgICAgPSAnVGVzdCBzcGVlY2gnO1xyXG4gICAgU1RfU1BFRUNIX1RFU1RfVCAgID0gJ1BsYXkgYSBzcGVlY2ggc2FtcGxlIHdpdGggdGhlIGN1cnJlbnQgc2V0dGluZ3MnO1xyXG4gICAgU1RfTEVHQUwgICAgICAgICAgID0gJ0xlZ2FsICYgQWNrbm93bGVkZ2VtZW50cyc7XHJcblxyXG4gICAgV0FSTl9TSE9SVF9IRUFERVIgPSAnXCJNYXkgSSBoYXZlIHlvdXIgYXR0ZW50aW9uIHBsZWFzZS4uLlwiJztcclxuICAgIFdBUk5fU0hPUlQgICAgICAgID0gJ1RoaXMgZGlzcGxheSBpcyB0b28gc2hvcnQgdG8gc3VwcG9ydCBSQUcuIFBsZWFzZSBtYWtlIHRoaXMnICtcclxuICAgICAgICAnIHdpbmRvdyB0YWxsZXIsIG9yIHJvdGF0ZSB5b3VyIGRldmljZSBmcm9tIGxhbmRzY2FwZSB0byBwb3J0cmFpdC4nO1xyXG5cclxuICAgIC8vIFRPRE86IFRoZXNlIGRvbid0IGZpdCBoZXJlOyB0aGlzIHNob3VsZCBnbyBpbiB0aGUgZGF0YVxyXG4gICAgTEVUVEVSUyA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWic7XHJcbiAgICBESUdJVFMgID0gW1xyXG4gICAgICAgICd6ZXJvJywgICAgICdvbmUnLCAgICAgJ3R3bycsICAgICAndGhyZWUnLCAgICAgJ2ZvdXInLCAgICAgJ2ZpdmUnLCAgICAnc2l4JyxcclxuICAgICAgICAnc2V2ZW4nLCAgICAnZWlnaHQnLCAgICduaW5lJywgICAgJ3RlbicsICAgICAgICdlbGV2ZW4nLCAgICd0d2VsdmUnLCAgJ3RoaXJ0ZWVuJyxcclxuICAgICAgICAnZm91cnRlZW4nLCAnZmlmdGVlbicsICdzaXh0ZWVuJywgJ3NldmVudGVlbicsICdlaWdodGVlbicsICduaW50ZWVuJywgJ3R3ZW50eSdcclxuICAgIF07XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSG9sZHMgbWV0aG9kcyBmb3IgcHJvY2Vzc2luZyBlYWNoIHR5cGUgb2YgcGhyYXNlIGVsZW1lbnQgaW50byBIVE1MLCB3aXRoIGRhdGEgdGFrZW5cclxuICogZnJvbSB0aGUgY3VycmVudCBzdGF0ZS4gRWFjaCBtZXRob2QgdGFrZXMgYSBjb250ZXh0IG9iamVjdCwgaG9sZGluZyBkYXRhIGZvciB0aGVcclxuICogY3VycmVudCBYTUwgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgYW5kIHRoZSBYTUwgZG9jdW1lbnQgYmVpbmcgdXNlZC5cclxuICovXHJcbmNsYXNzIEVsZW1lbnRQcm9jZXNzb3JzXHJcbntcclxuICAgIC8qKiBGaWxscyBpbiBjb2FjaCBsZXR0ZXJzIGZyb20gQSB0byBaICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvYWNoKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0NPQUNIKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldENvYWNoKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGV4Y3VzZSwgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGV4Y3VzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0VYQ1VTRTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5leGN1c2U7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBpbnRlZ2Vycywgb3B0aW9uYWxseSB3aXRoIG5vdW5zIGFuZCBpbiB3b3JkIGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50ZWdlcihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnc2luZ3VsYXInKTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsdXJhbCcpO1xyXG4gICAgICAgIGxldCB3b3JkcyAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnd29yZHMnKTtcclxuXHJcbiAgICAgICAgbGV0IGludCAgICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGNvbnRleHQpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAod29yZHMgJiYgd29yZHMudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoaW50ID09PSAxICYmIHNpbmd1bGFyKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3Npbmd1bGFyfWA7XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHBsdXJhbClcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtwbHVyYWx9YDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0lOVEVHRVIoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHI7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG5cclxuICAgICAgICBpZiAoc2luZ3VsYXIpIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ10gPSBzaW5ndWxhcjtcclxuICAgICAgICBpZiAocGx1cmFsKSAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddICAgPSBwbHVyYWw7XHJcbiAgICAgICAgaWYgKHdvcmRzKSAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wyd3b3JkcyddICAgID0gd29yZHM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBuYW1lZChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX05BTUVEO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLm5hbWVkO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlLCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZShyZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9ICcnO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0UocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmFwcGVuZENoaWxkKCBFbGVtZW50UHJvY2Vzc29ycy53cmFwVG9Jbm5lcihwaHJhc2UpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcGhyYXNlIGZyb20gYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlc2V0LCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VzZXQoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG4gICAgICAgIGxldCBmb3JjZWRJZHggPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkeCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFU0VUKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBpZHggPSBmb3JjZWRJZHhcclxuICAgICAgICAgICAgPyBwYXJzZUludChmb3JjZWRJZHgpXHJcbiAgICAgICAgICAgIDogUkFHLnN0YXRlLmdldFBocmFzZXNldElkeChyZWYpO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlID0gcGhyYXNlc2V0LmNoaWxkcmVuW2lkeF0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2lkeCddID0gZm9yY2VkSWR4IHx8IGlkeC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGhyYXNlc2V0cyB3aXRoIGEgY2hhbmNlIHZhbHVlIGFzIGNvbGxhcHNpYmxlXHJcbiAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQoIEVsZW1lbnRQcm9jZXNzb3JzLndyYXBUb0lubmVyKHBocmFzZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGxhdGZvcm0oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9QTEFURk9STTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IChSQUcuc3RhdGUucGxhdGZvcm1bMV0gPT09ICdNJylcclxuICAgICAgICAgICAgPyBSQUcuc3RhdGUucGxhdGZvcm1bMF0gKyAnwr4nXHJcbiAgICAgICAgICAgIDogUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNlcnZpY2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU0VSVklDRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBuYW1lcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9uKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgY29kZSAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU1RBVElPTihjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBsaXN0cyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9ubGlzdChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzdGF0aW9ucyAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjb250ZXh0KS5zbGljZSgpO1xyXG4gICAgICAgIGxldCBzdGF0aW9uTGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KHN0YXRpb25zLCBjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT05MSVNUKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gc3RhdGlvbkxpc3Q7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgdGltZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0aW1lKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1RJTUUoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0VGltZShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHZveCBwYXJ0cyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB2b3goY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdrZXknKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTG9jYWxpemVcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCAgICA9IGN0eC54bWxFbGVtZW50LnRleHRDb250ZW50O1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgICAgID0gYENsaWNrIHRvIGVkaXQgdGhpcyBwaHJhc2UgKCR7a2V5fSlgO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgICAgID0gMTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydrZXknXSA9IGtleTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB1bmtub3duIGVsZW1lbnRzIHdpdGggYW4gaW5saW5lIGVycm9yIG1lc3NhZ2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdW5rbm93bihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWUgPSBjdHgueG1sRWxlbWVudC5ub2RlTmFtZTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX0VMRU1FTlQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRhY2hlcyBjaGFuY2UgYW5kIGEgcHJlLWRldGVybWluZWQgY29sbGFwc2Ugc3RhdGUgZm9yIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQsIGlmXHJcbiAgICAgKiBpdCBkb2VzIGhhdmUgYSBjaGFuY2UgYXR0cmlidWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGN0eCBDb250ZXh0IG9mIHRoZSBjdXJyZW50IHBocmFzZSBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZFxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IChvciBwaWNrKSB0aGUgY29sbGFwc2Ugc3RhdGUgb2ZcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWFrZUNvbGxhcHNpYmxlKGN0eDogUGhyYXNlQ29udGV4dCwgcmVmOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICggIWN0eC54bWxFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hhbmNlJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCBjaGFuY2UgICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2NoYW5jZScpITtcclxuICAgICAgICBsZXQgY29sbGFwc2VkID0gUkFHLnN0YXRlLmdldENvbGxhcHNlZCggcmVmLCBwYXJzZUludChjaGFuY2UpICk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddID0gY2hhbmNlO1xyXG5cclxuICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KGN0eC5uZXdFbGVtZW50LCBjb2xsYXBzZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xvbmVzIHRoZSBjaGlsZHJlbiBvZiB0aGUgZ2l2ZW4gZWxlbWVudCBpbnRvIGEgbmV3IGlubmVyIHNwYW4gdGFnLCBzbyB0aGF0IHRoZXlcclxuICAgICAqIGNhbiBiZSBtYWRlIGNvbGxhcHNpYmxlIG9yIGJ1bmRsZWQgd2l0aCBidXR0b25zLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzb3VyY2UgUGFyZW50IHRvIGNsb25lIHRoZSBjaGlsZHJlbiBvZiwgaW50byBhIHdyYXBwZXJcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgd3JhcFRvSW5uZXIoc291cmNlOiBIVE1MRWxlbWVudCkgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgaW5uZXIuY2xhc3NMaXN0LmFkZCgnaW5uZXInKTtcclxuICAgICAgICBET00uY2xvbmVJbnRvKHNvdXJjZSwgaW5uZXIpO1xyXG5cclxuICAgICAgICByZXR1cm4gaW5uZXI7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogUmVwcmVzZW50cyBjb250ZXh0IGRhdGEgZm9yIGEgcGhyYXNlLCB0byBiZSBwYXNzZWQgdG8gYW4gZWxlbWVudCBwcm9jZXNzb3IgKi9cclxuaW50ZXJmYWNlIFBocmFzZUNvbnRleHRcclxue1xyXG4gICAgLyoqIEdldHMgdGhlIFhNTCBwaHJhc2UgZWxlbWVudCB0aGF0IGlzIGJlaW5nIHJlcGxhY2VkICovXHJcbiAgICB4bWxFbGVtZW50IDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogR2V0cyB0aGUgSFRNTCBzcGFuIGVsZW1lbnQgdGhhdCBpcyByZXBsYWNpbmcgdGhlIFhNTCBlbGVtZW50ICovXHJcbiAgICBuZXdFbGVtZW50IDogSFRNTFNwYW5FbGVtZW50O1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIEhhbmRsZXMgdGhlIHRyYW5zZm9ybWF0aW9uIG9mIHBocmFzZSBYTUwgZGF0YSwgaW50byBIVE1MIGVsZW1lbnRzIHdpdGggdGhlaXIgZGF0YVxyXG4gKiBmaWxsZWQgaW4gYW5kIHRoZWlyIFVJIGxvZ2ljIHdpcmVkLlxyXG4gKi9cclxuY2xhc3MgUGhyYXNlclxyXG57XHJcbiAgICAvKipcclxuICAgICAqIFJlY3Vyc2l2ZWx5IHByb2Nlc3NlcyBYTUwgZWxlbWVudHMsIGZpbGxpbmcgaW4gZGF0YSBhbmQgYXBwbHlpbmcgdHJhbnNmb3Jtcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyIFBhcmVudCB0byBwcm9jZXNzIHRoZSBjaGlsZHJlbiBvZlxyXG4gICAgICogQHBhcmFtIGxldmVsIEN1cnJlbnQgbGV2ZWwgb2YgcmVjdXJzaW9uLCBtYXguIDIwXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwcm9jZXNzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxldmVsOiBudW1iZXIgPSAwKVxyXG4gICAge1xyXG4gICAgICAgIC8vIEluaXRpYWxseSwgdGhpcyBtZXRob2Qgd2FzIHN1cHBvc2VkIHRvIGp1c3QgYWRkIHRoZSBYTUwgZWxlbWVudHMgZGlyZWN0bHkgaW50b1xyXG4gICAgICAgIC8vIHRoZSBkb2N1bWVudC4gSG93ZXZlciwgdGhpcyBjYXVzZWQgYSBsb3Qgb2YgcHJvYmxlbXMgKGUuZy4gdGl0bGUgbm90IHdvcmtpbmcpLlxyXG4gICAgICAgIC8vIEhUTUwgZG9lcyBub3Qgd29yayByZWFsbHkgd2VsbCB3aXRoIGN1c3RvbSBlbGVtZW50cywgZXNwZWNpYWxseSBpZiB0aGV5IGFyZSBvZlxyXG4gICAgICAgIC8vIGFub3RoZXIgWE1MIG5hbWVzcGFjZS5cclxuXHJcbiAgICAgICAgbGV0IHF1ZXJ5ICAgPSAnOm5vdChzcGFuKTpub3Qoc3ZnKTpub3QodXNlKTpub3QoYnV0dG9uKSc7XHJcbiAgICAgICAgbGV0IHBlbmRpbmcgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbChxdWVyeSkgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XHJcblxyXG4gICAgICAgIC8vIE5vIG1vcmUgWE1MIGVsZW1lbnRzIHRvIGV4cGFuZFxyXG4gICAgICAgIGlmIChwZW5kaW5nLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBYTUwgZWxlbWVudCBjdXJyZW50bHkgaW4gdGhlIGNvbnRhaW5lcjpcclxuICAgICAgICAvLyAqIENyZWF0ZSBhIG5ldyBzcGFuIGVsZW1lbnQgZm9yIGl0XHJcbiAgICAgICAgLy8gKiBIYXZlIHRoZSBwcm9jZXNzb3JzIHRha2UgZGF0YSBmcm9tIHRoZSBYTUwgZWxlbWVudCwgdG8gcG9wdWxhdGUgdGhlIG5ldyBvbmVcclxuICAgICAgICAvLyAqIFJlcGxhY2UgdGhlIFhNTCBlbGVtZW50IHdpdGggdGhlIG5ldyBvbmVcclxuICAgICAgICBwZW5kaW5nLmZvckVhY2goZWxlbWVudCA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnROYW1lID0gZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBsZXQgbmV3RWxlbWVudCAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgICAgIGxldCBjb250ZXh0ICAgICA9IHtcclxuICAgICAgICAgICAgICAgIHhtbEVsZW1lbnQ6IGVsZW1lbnQsXHJcbiAgICAgICAgICAgICAgICBuZXdFbGVtZW50OiBuZXdFbGVtZW50XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBuZXdFbGVtZW50LmRhdGFzZXRbJ3R5cGUnXSA9IGVsZW1lbnROYW1lO1xyXG5cclxuICAgICAgICAgICAgLy8gSSB3YW50ZWQgdG8gdXNlIGFuIGluZGV4IG9uIEVsZW1lbnRQcm9jZXNzb3JzIGZvciB0aGlzLCBidXQgaXQgY2F1c2VkIGV2ZXJ5XHJcbiAgICAgICAgICAgIC8vIHByb2Nlc3NvciB0byBoYXZlIGFuIFwidW51c2VkIG1ldGhvZFwiIHdhcm5pbmcuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoZWxlbWVudE5hbWUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMuY29hY2goY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnZXhjdXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5leGN1c2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLmludGVnZXIoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ25hbWVkJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMubmFtZWQoY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGhyYXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5waHJhc2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2VzZXQnOiAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZXNldChjb250ZXh0KTsgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BsYXRmb3JtJzogICAgRWxlbWVudFByb2Nlc3NvcnMucGxhdGZvcm0oY29udGV4dCk7ICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICBFbGVtZW50UHJvY2Vzc29ycy5zZXJ2aWNlKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnN0YXRpb24oY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbmxpc3QoY29udGV4dCk7IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAndGltZSc6ICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy50aW1lKGNvbnRleHQpOyAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd2b3gnOiAgICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnZveChjb250ZXh0KTsgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICAgICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudW5rbm93bihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUmVjdXJzZSBzbyB0aGF0IHdlIGNhbiBleHBhbmQgYW55IG5ldyBlbGVtZW50c1xyXG4gICAgICAgIGlmIChsZXZlbCA8IDIwKVxyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGFpbmVyLCBsZXZlbCArIDEpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoTC5QSFJBU0VSX1RPT19SRUNVUlNJVkUpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xuXG5pbnRlcmZhY2UgU2NlbmFyaW9TdGVwXG57XG4gICAgdHlwZTogJ2Fubm91bmNlbWVudCcgfCAnd2FpdCc7XG4gICAgc3RhdGVKc29uPzogc3RyaW5nO1xuICAgIGdhcE1zOiBudW1iZXI7XG4gICAgd2FpdFNlY29uZHM/OiBudW1iZXI7XG59XG5cbmNsYXNzIFNjZW5hcmlvXG57XG4gICAgcHJpdmF0ZSBzdGVwczogU2NlbmFyaW9TdGVwW10gPSBbXTtcbiAgICBwcml2YXRlIGN1cnJlbnRJbmRleDogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIHJ1bm5pbmc6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIHBhdXNlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgdGltZXI6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSB3YWl0SW50ZXJ2YWw6IG51bWJlciA9IDA7XG4gICAgLyoqIFdoZW4gdHJ1ZSwgdGhlIHNjZW5hcmlvIHN0b3BzIHJpZ2h0IGFmdGVyIHRoZSBjdXJyZW50IHN0ZXAgKHNpbmdsZS1zdGVwIHBsYXkpICovXG4gICAgcHJpdmF0ZSBzdG9wQWZ0ZXJTdGVwOiBib29sZWFuID0gZmFsc2U7XG4gICAgLyoqIFNhZmV0eSB0aW1lcjogYWR2YW5jZXMgdGhlIHN0ZXAgZXZlbiBpZiB0aGUgc3BlZWNoIGVuZ2luZSBuZXZlciBzaWduYWxzIGNvbXBsZXRpb24gKi9cbiAgICBwcml2YXRlIHdhdGNoZG9nOiBudW1iZXIgPSAwO1xuICAgIC8qKiBHdWFyZCBzbyBhIHN0ZXAgY29tcGxldGVzIChzcGVlY2ggZW5kIG9yIHdhdGNoZG9nKSBhbmQgYWR2YW5jZXMgZXhhY3RseSBvbmNlICovXG4gICAgcHJpdmF0ZSBzdGVwRmluaXNoZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGxvb3BDb3VudDogbnVtYmVyID0gMTtcbiAgICBwcml2YXRlIGxvb3BzRG9uZTogbnVtYmVyID0gMDtcblxuICAgIHB1YmxpYyBvblN0ZXA/OiAoaWR4OiBudW1iZXIsIHRvdGFsOiBudW1iZXIsIHN0ZXA6IFNjZW5hcmlvU3RlcCkgPT4gdm9pZDtcbiAgICBwdWJsaWMgb25XYWl0Q291bnRkb3duPzogKHJlbWFpbmluZzogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBvbkNvbXBsZXRlPzogKCkgPT4gdm9pZDtcbiAgICBwdWJsaWMgb25FcnJvcj86IChtc2c6IHN0cmluZykgPT4gdm9pZDtcbiAgICBwdWJsaWMgb25UZXh0VXBkYXRlPzogKHRleHQ6IHN0cmluZykgPT4gdm9pZDtcblxuICAgIHB1YmxpYyBzZXRTdGVwcyhzdGVwczogU2NlbmFyaW9TdGVwW10pOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnN0ZXBzID0gc3RlcHM7XG4gICAgICAgIHRoaXMuY3VycmVudEluZGV4ID0gMDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYWRkU3RlcChzdGF0ZUpzb246IHN0cmluZywgZ2FwTXM6IG51bWJlciA9IDE1MDApOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnN0ZXBzLnB1c2goeyB0eXBlOiAnYW5ub3VuY2VtZW50Jywgc3RhdGVKc29uLCBnYXBNcyB9KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2V0TG9vcENvdW50KG46IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMubG9vcENvdW50ID0gTWF0aC5tYXgoMSwgbik7XG4gICAgfVxuXG4gICAgcHVibGljIGdldCBzdGVwQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuc3RlcHMubGVuZ3RoOyB9XG4gICAgcHVibGljIGdldCBpc1J1bm5pbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnJ1bm5pbmc7IH1cbiAgICBwdWJsaWMgZ2V0IGlzUGF1c2VkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5wYXVzZWQ7IH1cbiAgICBwdWJsaWMgZXhwb3J0SnNvbigpOiB2b2lkIHsgLyogbm8tb3A7IGRhc2hib2FyZCBoYW5kbGVzIGV4cG9ydCAqLyB9XG4gICAgcHVibGljIGdldCBjdXJyZW50TG9vcFZhbHVlKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmxvb3BzRG9uZSArIDE7IH1cbiAgICBwdWJsaWMgZ2V0IHRvdGFsTG9vcHNWYWx1ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5sb29wQ291bnQ7IH1cblxuICAgIHB1YmxpYyBjbGVhcigpOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgdGhpcy5zdGVwcyA9IFtdO1xuICAgICAgICB0aGlzLmN1cnJlbnRJbmRleCA9IDA7XG4gICAgfVxuXG4gICAgcHVibGljIHBsYXkoKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKHRoaXMuc3RlcHMubGVuZ3RoID09PSAwKSByZXR1cm47XG4gICAgICAgIGlmICh0aGlzLnBhdXNlZClcbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucnVubmluZyA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnJ1blN0ZXAoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5jdXJyZW50SW5kZXggPSAwO1xuICAgICAgICB0aGlzLmxvb3BzRG9uZSA9IDA7XG4gICAgICAgIHRoaXMuc3RvcEFmdGVyU3RlcCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJ1blN0ZXAoKTtcbiAgICB9XG5cbiAgICAvKiogUGxheXMgZXhhY3RseSBvbmUgc3RlcCAoaXRzIGFubm91bmNlbWVudCwgb3IgaXRzIHdhaXQpLCB0aGVuIHN0b3BzICovXG4gICAgcHVibGljIHBsYXlTdGVwKGlkeDogbnVtYmVyKTogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKGlkeCA8IDAgfHwgaWR4ID49IHRoaXMuc3RlcHMubGVuZ3RoKSByZXR1cm47XG5cbiAgICAgICAgdGhpcy5zdG9wKCk7XG4gICAgICAgIHRoaXMucnVubmluZyA9IHRydWU7XG4gICAgICAgIHRoaXMucGF1c2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuY3VycmVudEluZGV4ID0gaWR4O1xuICAgICAgICB0aGlzLmxvb3BzRG9uZSA9IDA7XG4gICAgICAgIHRoaXMubG9vcENvdW50ID0gMTtcbiAgICAgICAgdGhpcy5zdG9wQWZ0ZXJTdGVwID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5ydW5TdGVwKCk7XG4gICAgfVxuXG4gICAgcHVibGljIHBhdXNlKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLnBhdXNlZCAgPSB0cnVlO1xuXG4gICAgICAgIC8vIFN0b3Agc3BlZWNoIGZpcnN0OiBpdCBtYXkgcmUtZmlyZSBvbnN0b3AsIHdoaWNoIGNvdWxkIHNjaGVkdWxlIGFcbiAgICAgICAgLy8gcGVuZGluZyBhZHZhbmNlOyBjbGVhciBhbGwgdGltZXJzIGFmdGVyd2FyZHMgc28gbm90aGluZyBzdXJ2aXZlcy5cbiAgICAgICAgaWYgKHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy5zcGVlY2gpIFJBRy5zcGVlY2guc3RvcCgpO1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lcik7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLndhdGNoZG9nKTtcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLndhaXRJbnRlcnZhbCk7XG4gICAgICAgIHRoaXMuYnJvYWRjYXN0KCdTVE9QX1BMQVlCQUNLJyk7XG4gICAgfVxuXG4gICAgcHVibGljIHN0b3AoKTogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMucGF1c2VkICA9IGZhbHNlO1xuXG4gICAgICAgIC8vIFN0b3Agc3BlZWNoIGZpcnN0IChzZWUgcGF1c2UpIHNvIGEgcmUtZmlyZWQgb25zdG9wIGNhbid0IGxlYXZlIGFcbiAgICAgICAgLy8gcGVuZGluZyBhZHZhbmNlIHRpbWVyIGJlaGluZCB0aGlzIGNsZWFyLlxuICAgICAgICBpZiAodHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnNwZWVjaCkgUkFHLnNwZWVjaC5zdG9wKCk7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKTtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMud2F0Y2hkb2cpO1xuICAgICAgICBjbGVhckludGVydmFsKHRoaXMud2FpdEludGVydmFsKTtcbiAgICAgICAgdGhpcy5zdGVwRmluaXNoZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5zdG9wQWZ0ZXJTdGVwID0gZmFsc2U7XG4gICAgICAgIHRoaXMuYnJvYWRjYXN0KCdTVE9QX1BMQVlCQUNLJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBydW5TdGVwKCk6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuY3VycmVudEluZGV4ID49IHRoaXMuc3RlcHMubGVuZ3RoKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLmxvb3BzRG9uZSsrO1xuICAgICAgICAgICAgaWYgKHRoaXMubG9vcHNEb25lIDwgdGhpcy5sb29wQ291bnQpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIHRoaXMucnVuU3RlcCgpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0KCdTVE9QX1BMQVlCQUNLJyk7XG4gICAgICAgICAgICBpZiAodGhpcy5vbkNvbXBsZXRlKSB0aGlzLm9uQ29tcGxldGUoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzdGVwID0gdGhpcy5zdGVwc1t0aGlzLmN1cnJlbnRJbmRleF07XG4gICAgICAgIGlmICh0aGlzLm9uU3RlcCkgdGhpcy5vblN0ZXAodGhpcy5jdXJyZW50SW5kZXgsIHRoaXMuc3RlcHMubGVuZ3RoLCBzdGVwKTtcblxuICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnd2FpdCcpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCB0b3RhbCA9IHN0ZXAud2FpdFNlY29uZHMgfHwgMDtcbiAgICAgICAgICAgIGxldCByZW1haW5pbmcgPSB0b3RhbDtcbiAgICAgICAgICAgIGxldCB3YWl0VGV4dCA9IGBXYWl0aW5nICR7cmVtYWluaW5nfXMuLi5gO1xuICAgICAgICAgICAgaWYgKHRoaXMub25UZXh0VXBkYXRlKSB0aGlzLm9uVGV4dFVwZGF0ZSh3YWl0VGV4dCk7XG4gICAgICAgICAgICBpZiAodGhpcy5vbldhaXRDb3VudGRvd24pIHRoaXMub25XYWl0Q291bnRkb3duKHJlbWFpbmluZywgdG90YWwpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy52aWV3cyAmJiBSQUcudmlld3MubWFycXVlZSkgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KHdhaXRUZXh0KTtcbiAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0KCdXQUlUX0NPVU5URE9XTicsIHsgcmVtYWluaW5nU2Vjb25kczogcmVtYWluaW5nLCB0b3RhbFNlY29uZHM6IHRvdGFsIH0pO1xuXG4gICAgICAgICAgICB0aGlzLndhaXRJbnRlcnZhbCA9IHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlbWFpbmluZy0tO1xuICAgICAgICAgICAgICAgIGlmIChyZW1haW5pbmcgPD0gMClcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy53YWl0SW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxldCB0eHQgPSBgV2FpdGluZyAke3JlbWFpbmluZ31zLi4uYDtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vblRleHRVcGRhdGUpIHRoaXMub25UZXh0VXBkYXRlKHR4dCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub25XYWl0Q291bnRkb3duKSB0aGlzLm9uV2FpdENvdW50ZG93bihyZW1haW5pbmcsIHRvdGFsKTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIFJBRyAhPT0gJ3VuZGVmaW5lZCcgJiYgUkFHLnZpZXdzICYmIFJBRy52aWV3cy5tYXJxdWVlKSBSQUcudmlld3MubWFycXVlZS5zZXQodHh0KTtcbiAgICAgICAgICAgICAgICB0aGlzLmJyb2FkY2FzdCgnV0FJVF9DT1VOVERPV04nLCB7IHJlbWFpbmluZ1NlY29uZHM6IHJlbWFpbmluZywgdG90YWxTZWNvbmRzOiB0b3RhbCB9KTtcbiAgICAgICAgICAgIH0sIDEwMDApO1xuXG4gICAgICAgICAgICB0aGlzLnRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMud2FpdEludGVydmFsKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFkdmFuY2UoKTtcbiAgICAgICAgICAgIH0sIHRvdGFsICogMTAwMCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBbm5vdW5jZW1lbnQgc3RlcFxuICAgICAgICB0cnlcbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKHN0ZXAuc3RhdGVKc29uICYmIHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy5sb2FkKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFJBRy5sb2FkKHN0ZXAuc3RhdGVKc29uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSlcbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKHRoaXMub25FcnJvcikgdGhpcy5vbkVycm9yKCdGYWlsZWQgdG8gbG9hZCBzdGVwIHN0YXRlOiAnICsgZSk7XG4gICAgICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB0ZXh0ID0gKHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy52aWV3cyAmJiBSQUcudmlld3MuZWRpdG9yKSA/IFJBRy52aWV3cy5lZGl0b3IuZ2V0VGV4dCgpIDogJ1BsYXlpbmcgc3RlcC4uLic7XG4gICAgICAgIGlmICh0aGlzLm9uVGV4dFVwZGF0ZSkgdGhpcy5vblRleHRVcGRhdGUodGV4dCk7XG4gICAgICAgIGlmICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcudmlld3MgJiYgUkFHLnZpZXdzLm1hcnF1ZWUpIFJBRy52aWV3cy5tYXJxdWVlLnNldCh0ZXh0KTtcbiAgICAgICAgdGhpcy5icm9hZGNhc3QoJ1BMQVlfU0NFTkFSSU9fU1RFUCcsIHsgaW5kZXg6IHRoaXMuY3VycmVudEluZGV4LCB0ZXh0OiB0ZXh0IH0pO1xuXG4gICAgICAgIGxldCBwaHJhc2VFbCA9ICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcudmlld3MgJiYgUkFHLnZpZXdzLmVkaXRvcikgPyBSQUcudmlld3MuZWRpdG9yLmdldFBocmFzZSgpIDogbnVsbDtcbiAgICAgICAgaWYgKHBocmFzZUVsICYmIHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy5zcGVlY2gpXG4gICAgICAgIHtcbiAgICAgICAgICAgIC8vIFJlc2V0IHRoZSBwZXItc3RlcCBndWFyZCwgdGhlbiBhcm0gYm90aCB0aGUgbm9ybWFsIHBhdGggKHNwZWVjaFxuICAgICAgICAgICAgLy8gc2lnbmFscyBjb21wbGV0aW9uKSBhbmQgYSB3YXRjaGRvZyBpbiBjYXNlIHRoZSBlbmdpbmUgbmV2ZXIgZG9lcy5cbiAgICAgICAgICAgIHRoaXMuc3RlcEZpbmlzaGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIFJBRy5zcGVlY2gub25zcGVhayA9ICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IGN1cnJlbnRUZXh0ID0gUkFHLnZpZXdzLmVkaXRvci5nZXRUZXh0KCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub25UZXh0VXBkYXRlKSB0aGlzLm9uVGV4dFVwZGF0ZShjdXJyZW50VGV4dCk7XG4gICAgICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KGN1cnJlbnRUZXh0KTtcbiAgICAgICAgICAgICAgICBSQUcuc3BlZWNoLm9uc3BlYWsgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCA9ICgpID0+XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5maW5pc2hTdGVwKHN0ZXAuZ2FwTXMpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gV2F0Y2hkb2c6IGdlbmVyb3VzIGVub3VnaCBub3QgdG8gY3V0IHJlYWwgc3BlZWNoIHNob3J0XG4gICAgICAgICAgICAvLyAofjkwbXMvY2hhciwgY2xhbXBlZCB0byA2cy4uNjBzKSwgYnV0IGJvdW5kZWQgc28gYSBodW5nIGVuZ2luZVxuICAgICAgICAgICAgLy8gY2FuIG5ldmVyIHN0YWxsIHRoZSBzY2VuYXJpby5cbiAgICAgICAgICAgIGxldCB3YXRjaGRvZ01zID0gTWF0aC5taW4oNjAwMDAsIE1hdGgubWF4KDYwMDAsIHRleHQubGVuZ3RoICogOTApKTtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLndhdGNoZG9nKTtcbiAgICAgICAgICAgIHRoaXMud2F0Y2hkb2cgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMuZmluaXNoU3RlcChzdGVwLmdhcE1zKTtcbiAgICAgICAgICAgIH0sIHdhdGNoZG9nTXMpO1xuXG4gICAgICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKHBocmFzZUVsKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuc3RlcEZpbmlzaGVkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT5cbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkdmFuY2UoKTtcbiAgICAgICAgICAgIH0sIHN0ZXAuZ2FwTXMgfHwgMTUwMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb21wbGV0ZXMgdGhlIGN1cnJlbnQgc3RlcCBleGFjdGx5IG9uY2UsIHdoZXRoZXIgaXQgZW5kZWQgYmVjYXVzZSB0aGVcbiAgICAgKiBzcGVlY2ggZW5naW5lIHNpZ25hbGxlZCBjb21wbGV0aW9uIG9yIGJlY2F1c2UgdGhlIHdhdGNoZG9nIGZpcmVkLiBTYWZlXG4gICAgICogYWdhaW5zdCB0aGUgcmUtZW50cmFudCBvbnN0b3AgdGhhdCBzcGVlY2guc3RvcCgpIGNhbiB0cmlnZ2VyOiB0aGVcbiAgICAgKiBzdGVwRmluaXNoZWQgZ3VhcmQgaXMgc2V0IGJlZm9yZSBzcGVlY2ggaXMgc3RvcHBlZC5cbiAgICAgKi9cbiAgICBwcml2YXRlIGZpbmlzaFN0ZXAoZ2FwTXM6IG51bWJlcik6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICh0aGlzLnN0ZXBGaW5pc2hlZClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy5zdGVwRmluaXNoZWQgPSB0cnVlO1xuXG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLndhdGNoZG9nKTtcbiAgICAgICAgaWYgKHR5cGVvZiBSQUcgIT09ICd1bmRlZmluZWQnICYmIFJBRy5zcGVlY2gpXG4gICAgICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcblxuICAgICAgICB0aGlzLnRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5hZHZhbmNlKCk7XG4gICAgICAgIH0sIGdhcE1zIHx8IDApO1xuICAgIH1cblxuICAgIHByaXZhdGUgYWR2YW5jZSgpOiB2b2lkXG4gICAge1xuICAgICAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuXG4gICAgICAgIC8vIFwiUGxheSBvbmUgc3RlcFwiIG1vZGU6IHRoaXMgc3RlcCB3YXMgdGhlIG9ubHkgb25lIGFza2VkIGZvciwgc29cbiAgICAgICAgLy8gZmluaXNoIHRoZSBydW4gaGVyZS5cbiAgICAgICAgaWYgKHRoaXMuc3RvcEFmdGVyU3RlcClcbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5zdG9wQWZ0ZXJTdGVwID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucGF1c2VkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmJyb2FkY2FzdCgnU1RPUF9QTEFZQkFDSycpO1xuICAgICAgICAgICAgaWYgKHRoaXMub25Db21wbGV0ZSkgdGhpcy5vbkNvbXBsZXRlKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmN1cnJlbnRJbmRleCsrO1xuICAgICAgICB0aGlzLnJ1blN0ZXAoKTtcbiAgICB9XG5cbiAgICAvKiogQnJvYWRjYXN0IGEgcGxheWJhY2sgZXZlbnQgdG8gdGhlIG90aGVyIHRhYnMgKHRoZSBlZGl0b3IgbWlycm9ycyBpdCwgZGlzcGxheS1vbmx5KSAqL1xuICAgIHByaXZhdGUgYnJvYWRjYXN0KHR5cGU6IHN0cmluZywgcGF5bG9hZD86IGFueSk6IHZvaWRcbiAgICB7XG4gICAgICAgIGlmICh0eXBlb2YgUkFHICE9PSAndW5kZWZpbmVkJyAmJiBSQUcuY2hhbm5lbClcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLnNlbmQodHlwZSwgcGF5bG9hZCB8fCB7fSk7XG4gICAgfVxufVxuXG4od2luZG93IGFzIGFueSkuU2NlbmFyaW8gPSBTY2VuYXJpbztcbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IGNsYXNzIGZvciByZXNvbHZpbmcgYSBnaXZlbiBwaHJhc2UgdG8gdm94IGtleXMgKi9cclxuY2xhc3MgUmVzb2x2ZXJcclxue1xyXG4gICAgLyoqIFRyZWVXYWxrZXIgZmlsdGVyIHRvIHJlZHVjZSBhIHdhbGsgdG8ganVzdCB0aGUgZWxlbWVudHMgdGhlIHJlc29sdmVyIG5lZWRzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IG5vZGUucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXBhcmVudFR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgICAgID0gcGFyZW50LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICBwYXJlbnRUeXBlID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFjY2VwdCB0ZXh0IG9ubHkgZnJvbSBwaHJhc2UgYW5kIHBocmFzZXNldHNcclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpXHJcbiAgICAgICAgaWYgKHBhcmVudFR5cGUgIT09ICdwaHJhc2VzZXQnICYmIHBhcmVudFR5cGUgIT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcclxuXHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBsZXQgdHlwZSAgICA9IGVsZW1lbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICAgICAgLy8gUmVqZWN0IGNvbGxhcHNlZCBlbGVtZW50cyBhbmQgdGhlaXIgY2hpbGRyZW5cclxuICAgICAgICAgICAgaWYgKCBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVDtcclxuXHJcbiAgICAgICAgICAgIC8vIFNraXAgdHlwZWxlc3MgKHdyYXBwZXIpIGVsZW1lbnRzXHJcbiAgICAgICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCBvdmVyIHBocmFzZSBhbmQgcGhyYXNlc2V0cyAoaW5zdGVhZCwgb25seSBnb2luZyBmb3IgdGhlaXIgY2hpbGRyZW4pXHJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAncGhyYXNlc2V0JyB8fCB0eXBlID09PSAncGhyYXNlJylcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBocmFzZSAgICA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHByaXZhdGUgZmxhdHRlbmVkIDogTm9kZVtdO1xyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZWQgIDogVm94S2V5W107XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBocmFzZTogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5waHJhc2UgICAgPSBwaHJhc2U7XHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyB0b1ZveCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICAvLyBGaXJzdCwgd2FsayB0aHJvdWdoIHRoZSBwaHJhc2UgYW5kIFwiZmxhdHRlblwiIGl0IGludG8gYW4gYXJyYXkgb2YgcGFydHMuIFRoaXMgaXNcclxuICAgICAgICAvLyBzbyB0aGUgcmVzb2x2ZXIgY2FuIGxvb2stYWhlYWQgb3IgbG9vay1iZWhpbmQuXHJcblxyXG4gICAgICAgIHRoaXMuZmxhdHRlbmVkID0gW107XHJcbiAgICAgICAgdGhpcy5yZXNvbHZlZCAgPSBbXTtcclxuICAgICAgICBsZXQgdHJlZVdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXHJcbiAgICAgICAgICAgIHRoaXMucGhyYXNlLFxyXG4gICAgICAgICAgICBOb2RlRmlsdGVyLlNIT1dfVEVYVCB8IE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5ULFxyXG4gICAgICAgICAgICB7IGFjY2VwdE5vZGU6IFJlc29sdmVyLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIHRyZWVXYWxrZXIubmV4dE5vZGUoKSApXHJcbiAgICAgICAgaWYgKHRyZWVXYWxrZXIuY3VycmVudE5vZGUudGV4dENvbnRlbnQhLnRyaW0oKSAhPT0gJycpXHJcbiAgICAgICAgICAgIHRoaXMuZmxhdHRlbmVkLnB1c2godHJlZVdhbGtlci5jdXJyZW50Tm9kZSk7XHJcblxyXG4gICAgICAgIC8vIFRoZW4sIHJlc29sdmUgYWxsIHRoZSBwaHJhc2VzJyBub2RlcyBpbnRvIHZveCBrZXlzXHJcblxyXG4gICAgICAgIHRoaXMuZmxhdHRlbmVkLmZvckVhY2goICh2LCBpKSA9PiB0aGlzLnJlc29sdmVkLnB1c2goIC4uLnRoaXMucmVzb2x2ZSh2LCBpKSApICk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMuZmxhdHRlbmVkLCB0aGlzLnJlc29sdmVkKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVzZXMgdGhlIHR5cGUgYW5kIHZhbHVlIG9mIHRoZSBnaXZlbiBub2RlLCB0byByZXNvbHZlIGl0IHRvIHZveCBmaWxlIElEcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbm9kZSBOb2RlIHRvIHJlc29sdmUgdG8gdm94IElEc1xyXG4gICAgICogQHBhcmFtIGlkeCBJbmRleCBvZiB0aGUgbm9kZSBiZWluZyByZXNvbHZlZCByZWxhdGl2ZSB0byB0aGUgcGhyYXNlIGFycmF5XHJcbiAgICAgKiBAcmV0dXJucyBBcnJheSBvZiBJRHMgdGhhdCBtYWtlIHVwIG9uZSBvciBtb3JlIGZpbGUgSURzLiBDYW4gYmUgZW1wdHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVzb2x2ZShub2RlOiBOb2RlLCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRleHQobm9kZSk7XHJcblxyXG4gICAgICAgIGxldCBlbGVtZW50ID0gbm9kZSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgdHlwZSAgICA9IGVsZW1lbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlICdjb2FjaCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVDb2FjaChlbGVtZW50LCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIHJldHVybiB0aGlzLnJlc29sdmVFeGN1c2UoaWR4KTtcclxuICAgICAgICAgICAgY2FzZSAnaW50ZWdlcic6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlSW50ZWdlcihlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlTmFtZWQoKTtcclxuICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICByZXR1cm4gdGhpcy5yZXNvbHZlUGxhdGZvcm0oaWR4KTtcclxuICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlU2VydmljZShlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnc3RhdGlvbic6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlU3RhdGlvbihlbGVtZW50LCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9ubGlzdCc6IHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uTGlzdChlbGVtZW50LCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVUaW1lKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICd2b3gnOiAgICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVWb3goZWxlbWVudCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRJbmZsZWN0aW9uKGlkeDogbnVtYmVyKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXh0ID0gdGhpcy5mbGF0dGVuZWRbaWR4ICsgMV07XHJcblxyXG4gICAgICAgIHJldHVybiAoIG5leHQgJiYgbmV4dC50ZXh0Q29udGVudCEudHJpbSgpLnN0YXJ0c1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgID8gJ2VuZCdcclxuICAgICAgICAgICAgOiAnbWlkJztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVUZXh0KG5vZGU6IE5vZGUpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICBsZXQgdGV4dCAgID0gU3RyaW5ncy5jbGVhbihub2RlLnRleHRDb250ZW50ISk7XHJcbiAgICAgICAgbGV0IHNldCAgICA9IFtdO1xyXG5cclxuICAgICAgICAvLyBJZiB0ZXh0IGlzIGp1c3QgYSBmdWxsIHN0b3AsIHJldHVybiBzaWxlbmNlXHJcbiAgICAgICAgaWYgKHRleHQgPT09ICcuJylcclxuICAgICAgICAgICAgcmV0dXJuIFswLjY1XTtcclxuXHJcbiAgICAgICAgLy8gSWYgaXQgYmVnaW5zIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LnN0YXJ0c1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHNldC5wdXNoKDAuNjUpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGV4dCBkb2Vzbid0IGNvbnRhaW4gYW55IHdvcmRzLCBza2lwXHJcbiAgICAgICAgaWYgKCAhdGV4dC5tYXRjaCgvW2EtejAtOV0vaSkgKVxyXG4gICAgICAgICAgICByZXR1cm4gc2V0O1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHR5cGUgICA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgcmVmID0gcGFyZW50LmRhdGFzZXRbJ3JlZiddO1xyXG4gICAgICAgIGxldCBpZHggPSBET00ubm9kZUluZGV4T2Yobm9kZSk7XHJcbiAgICAgICAgbGV0IGlkICA9IGAke3R5cGV9LiR7cmVmfWA7XHJcblxyXG4gICAgICAgIC8vIEFwcGVuZCBpbmRleCBvZiBwaHJhc2VzZXQncyBjaG9pY2Ugb2YgcGhyYXNlXHJcbiAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnKVxyXG4gICAgICAgICAgICBpZCArPSBgLiR7cGFyZW50LmRhdGFzZXRbJ2lkeCddfWA7XHJcblxyXG4gICAgICAgIGlkICs9IGAuJHtpZHh9YDtcclxuICAgICAgICBzZXQucHVzaChpZCk7XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgZW5kcyB3aXRoIGEgZnVsbCBzdG9wLCBhZGQgc2lsZW5jZVxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJldHVybiBzZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlQ29hY2goZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IGNvYWNoICAgPSBSQUcuc3RhdGUuZ2V0Q29hY2goY3R4KTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMiwgYGxldHRlci4ke2NvYWNofS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVFeGN1c2UoaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgZXhjdXNlICA9IFJBRy5zdGF0ZS5leGN1c2U7XHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBTdHJpbmdzLmZpbGVuYW1lKGV4Y3VzZSk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFswLjE1LCBgZXhjdXNlLiR7a2V5fS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVJbnRlZ2VyKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGVsZW1lbnQuZGF0YXNldFsnc2luZ3VsYXInXTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBlbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIGxldCBpbnRlZ2VyICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGN0eCk7XHJcbiAgICAgICAgbGV0IHBhcnRzICAgID0gWzAuMTI1LCBgbnVtYmVyLiR7aW50ZWdlcn0ubWlkYF07XHJcblxyXG4gICAgICAgIGlmICAgICAgKHNpbmd1bGFyICYmIGludGVnZXIgPT09IDEpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSwgYG51bWJlci5zdWZmaXguJHtzaW5ndWxhcn0uZW5kYCk7XHJcbiAgICAgICAgZWxzZSBpZiAocGx1cmFsICAgJiYgaW50ZWdlciAhPT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjE1LCBgbnVtYmVyLnN1ZmZpeC4ke3BsdXJhbH0uZW5kYCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMTUpO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFydHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlTmFtZWQoKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWVkID0gU3RyaW5ncy5maWxlbmFtZShSQUcuc3RhdGUubmFtZWQpO1xyXG5cclxuICAgICAgICByZXR1cm4gWzAuMiwgYG5hbWVkLiR7bmFtZWR9Lm1pZGAsIDAuMl07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlUGxhdGZvcm0oaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgcGxhdGZvcm0gPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcbiAgICAgICAgbGV0IGluZmxlY3QgID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IGxldHRlciAgID0gKHBsYXRmb3JtWzFdID09PSAnwr4nKSA/ICdNJyA6IHBsYXRmb3JtWzFdO1xyXG4gICAgICAgIGxldCByZXN1bHQgICA9IFswLjE1LCBgbnVtYmVyLiR7cGxhdGZvcm1bMF19JHtsZXR0ZXJ9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVNlcnZpY2UoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc2VydmljZSA9IFN0cmluZ3MuZmlsZW5hbWUoIFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKGN0eCkgKTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFtdO1xyXG5cclxuICAgICAgICAvLyBPbmx5IGFkZCBiZWdpbm5pbmcgZGVsYXkgaWYgdGhlcmUgaXNuJ3QgYWxyZWFkeSBvbmUgcHJpb3JcclxuICAgICAgICBpZiAodHlwZW9mIHRoaXMucmVzb2x2ZWQuc2xpY2UoLTEpWzBdICE9PSAnbnVtYmVyJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4xNSk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucmVzdWx0LCBgc2VydmljZS4ke3NlcnZpY2V9Lm1pZGAsIDAuMTVdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbihjdHgpO1xyXG4gICAgICAgIGxldCB2b3hLZXkgID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb25Wb3goc3RhdGlvbik7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFswLjIsIGBzdGF0aW9uLiR7dm94S2V5fS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVTdGF0aW9uTGlzdChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgbGlzdCAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcblxyXG4gICAgICAgIGxldCBwYXJ0cyA6IFZveEtleVtdID0gWzAuMl07XHJcblxyXG4gICAgICAgIGxpc3QuZm9yRWFjaCggKGNvZGUsIGspID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdm94S2V5ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb25Wb3goY29kZSk7XHJcblxyXG4gICAgICAgICAgICAvLyBIYW5kbGUgbWlkZGxlIG9mIGxpc3QgaW5mbGVjdGlvblxyXG4gICAgICAgICAgICBpZiAoayAhPT0gbGlzdC5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGBzdGF0aW9uLiR7dm94S2V5fS5taWRgLCAwLjI1KTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwiYW5kXCIgaWYgbGlzdCBoYXMgbW9yZSB0aGFuIDEgc3RhdGlvbiBhbmQgdGhpcyBpcyB0aGUgZW5kXHJcbiAgICAgICAgICAgIGlmIChsaXN0Lmxlbmd0aCA+IDEpXHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCdzdGF0aW9uLnBhcnRzLmFuZC5taWQnLCAwLjI1KTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFkZCBcIm9ubHlcIiBpZiBvbmx5IG9uZSBzdGF0aW9uIGluIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICAgICAgaWYgKGxpc3QubGVuZ3RoID09PSAxICYmIGN0eCA9PT0gJ2NhbGxpbmcnKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGBzdGF0aW9uLiR7dm94S2V5fS5taWRgKTtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCAnc3RhdGlvbi5wYXJ0cy5vbmx5LmVuZCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9LiR7aW5mbGVjdH1gKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVUaW1lKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCB0aW1lICA9IFJBRy5zdGF0ZS5nZXRUaW1lKGN0eCkuc3BsaXQoJzonKTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMF0gPT09ICcwMCcgJiYgdGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgJ251bWJlci4wMDAwLm1pZCcsIDAuMl07XHJcblxyXG4gICAgICAgIC8vIEhvdXJzXHJcbiAgICAgICAgcGFydHMucHVzaChgbnVtYmVyLiR7dGltZVswXX0uYmVnaW5gKTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4wNzUsICdudW1iZXIuaHVuZHJlZC5taWQnKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCBgbnVtYmVyLiR7dGltZVsxXX0ubWlkYCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucGFydHMsIDAuMTVdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVZveChlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBlbGVtZW50LmlubmVyVGV4dC50cmltKCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IFtdO1xyXG5cclxuICAgICAgICBpZiAoIHRleHQuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJlc3VsdC5wdXNoKCBlbGVtZW50LmRhdGFzZXRbJ2tleSddISApO1xyXG5cclxuICAgICAgICBpZiAoIHRleHQuZW5kc1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuNjUpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgc3BlZWNoIHN5bnRoZXNpcyB1c2luZyBib3RoIG5hdGl2ZSBhbmQgY3VzdG9tIGVuZ2luZXMgKi9cclxuY2xhc3MgU3BlZWNoXHJcbntcclxuICAgIC8qKiBJbnN0YW5jZSBvZiB0aGUgY3VzdG9tIHZvaWNlIGVuZ2luZSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSB2b3hFbmdpbmU/IDogVm94RW5naW5lO1xyXG5cclxuICAgIC8qKiBEaWN0aW9uYXJ5IG9mIGJyb3dzZXItcHJvdmlkZWQgdm9pY2VzIGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljICBicm93c2VyVm9pY2VzIDogRGljdGlvbmFyeTxTcGVlY2hTeW50aGVzaXNWb2ljZT4gPSB7fTtcclxuICAgIC8qKiBFdmVudCBoYW5kbGVyIGZvciB3aGVuIHNwZWVjaCBpcyBhdWRpYmx5IHNwb2tlbiAqL1xyXG4gICAgcHVibGljICBvbnNwZWFrPyAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBFdmVudCBoYW5kbGVyIGZvciB3aGVuIHNwZWVjaCBoYXMgZW5kZWQgKi9cclxuICAgIHB1YmxpYyAgb25zdG9wPyAgICAgICA6ICgpID0+IHZvaWQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBuYXRpdmUgc3BlZWNoLXN0b3BwZWQgY2hlY2sgdGltZXIgKi9cclxuICAgIHByaXZhdGUgc3RvcFRpbWVyICAgICA6IG51bWJlciA9IDA7XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgYW55IHNwZWVjaCBlbmdpbmUgaXMgY3VycmVudGx5IHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgZ2V0IGlzU3BlYWtpbmcoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy52b3hFbmdpbmUgJiYgdGhpcy52b3hFbmdpbmUuaXNTcGVha2luZylcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gd2luZG93LnNwZWVjaFN5bnRoZXNpcy5zcGVha2luZztcclxuICAgIH1cclxuXHJcbiAgICAvKiogV2hldGhlciB0aGUgVk9YIGVuZ2luZSBpcyBjdXJyZW50bHkgYXZhaWxhYmxlICovXHJcbiAgICBwdWJsaWMgZ2V0IHZveEF2YWlsYWJsZSgpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnZveEVuZ2luZSAhPT0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU29tZSBicm93c2VycyBkb24ndCBwcm9wZXJseSBjYW5jZWwgc3BlZWNoIG9uIHBhZ2UgY2xvc2UuXHJcbiAgICAgICAgLy8gQlVHOiBvbnBhZ2VzaG93IGFuZCBvbnBhZ2VoaWRlIG5vdCB3b3JraW5nIG9uIGlPUyAxMVxyXG4gICAgICAgIHdpbmRvdy5vbmJlZm9yZXVubG9hZCA9XHJcbiAgICAgICAgd2luZG93Lm9udW5sb2FkICAgICAgID1cclxuICAgICAgICB3aW5kb3cub25wYWdlc2hvdyAgICAgPVxyXG4gICAgICAgIHdpbmRvdy5vbnBhZ2VoaWRlICAgICA9IHRoaXMuc3RvcC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5vbnZpc2liaWxpdHljaGFuZ2UgICAgICAgICAgICA9IHRoaXMub25WaXNpYmlsaXR5Q2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5vbnZvaWNlc2NoYW5nZWQgPSB0aGlzLm9uVm9pY2VzQ2hhbmdlZC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBFdmVuIHRob3VnaCAnb252b2ljZXNjaGFuZ2VkJyBpcyB1c2VkIGxhdGVyIHRvIHBvcHVsYXRlIHRoZSBsaXN0LCBDaHJvbWUgZG9lc1xyXG4gICAgICAgIC8vIG5vdCBhY3R1YWxseSBmaXJlIHRoZSBldmVudCB1bnRpbCB0aGlzIGNhbGwuLi5cclxuICAgICAgICB0aGlzLm9uVm9pY2VzQ2hhbmdlZCgpO1xyXG5cclxuICAgICAgICAvLyBGb3Igc29tZSByZWFzb24sIENocm9tZSBuZWVkcyB0aGlzIGNhbGxlZCBvbmNlIGZvciBuYXRpdmUgc3BlZWNoIHRvIHdvcmtcclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmNhbmNlbCgpO1xyXG5cclxuICAgICAgICB0cnkgICAgICAgICB7IHRoaXMudm94RW5naW5lID0gbmV3IFZveEVuZ2luZSgpOyB9XHJcbiAgICAgICAgY2F0Y2ggKGVycikgeyBjb25zb2xlLmVycm9yKCdDb3VsZCBub3QgY3JlYXRlIFZPWCBlbmdpbmU6JywgZXJyKTsgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBCZWdpbnMgc3BlYWtpbmcgdGhlIGdpdmVuIHBocmFzZSBjb21wb25lbnRzICovXHJcbiAgICBwdWJsaWMgc3BlYWsocGhyYXNlOiBIVE1MRWxlbWVudCwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzID0ge30pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICAvLyBWT1ggZW5naW5lXHJcbiAgICAgICAgaWYgICAgICAoIHRoaXMudm94RW5naW5lICYmIGVpdGhlcihzZXR0aW5ncy51c2VWb3gsIFJBRy5jb25maWcudm94RW5hYmxlZCkgKVxyXG4gICAgICAgICAgICB0aGlzLnNwZWFrVm94KHBocmFzZSwgc2V0dGluZ3MpO1xyXG5cclxuICAgICAgICAvLyBOYXRpdmUgYnJvd3NlciB0ZXh0LXRvLXNwZWVjaFxyXG4gICAgICAgIGVsc2UgaWYgKHdpbmRvdy5zcGVlY2hTeW50aGVzaXMpXHJcbiAgICAgICAgICAgIHRoaXMuc3BlYWtCcm93c2VyKHBocmFzZSwgc2V0dGluZ3MpO1xyXG5cclxuICAgICAgICAvLyBObyBzcGVlY2ggYXZhaWxhYmxlOyBjYWxsIHN0b3AgZXZlbnQgaGFuZGxlclxyXG4gICAgICAgIGVsc2UgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyBhbmQgY2FuY2VscyBhbGwgcXVldWVkIHNwZWVjaCAqL1xyXG4gICAgcHVibGljIHN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAod2luZG93LnNwZWVjaFN5bnRoZXNpcylcclxuICAgICAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5jYW5jZWwoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMudm94RW5naW5lKVxyXG4gICAgICAgICAgICB0aGlzLnZveEVuZ2luZS5zdG9wKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGF1c2UgYW5kIHVucGF1c2Ugc3BlZWNoIGlmIHRoZSBwYWdlIGlzIGhpZGRlbiBvciB1bmhpZGRlbiAqL1xyXG4gICAgcHJpdmF0ZSBvblZpc2liaWxpdHlDaGFuZ2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiBUaGlzIG5lZWRzIHRvIHBhdXNlIFZPWCBlbmdpbmVcclxuICAgICAgICBsZXQgaGlkaW5nID0gKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gJ2hpZGRlbicpO1xyXG5cclxuICAgICAgICBpZiAoaGlkaW5nKSB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnBhdXNlKCk7XHJcbiAgICAgICAgZWxzZSAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5yZXN1bWUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhc3luYyB2b2ljZSBsaXN0IGxvYWRpbmcgb24gc29tZSBicm93c2VycywgYW5kIHNldHMgZGVmYXVsdCAqL1xyXG4gICAgcHJpdmF0ZSBvblZvaWNlc0NoYW5nZWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmJyb3dzZXJWb2ljZXMgPSB7fTtcclxuXHJcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5nZXRWb2ljZXMoKS5mb3JFYWNoKHYgPT4gdGhpcy5icm93c2VyVm9pY2VzW3YubmFtZV0gPSB2KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIHRoZSBnaXZlbiBwaHJhc2UgdG8gdGV4dCBhbmQgc3BlYWtzIGl0IHZpYSBuYXRpdmUgYnJvd3NlciB2b2ljZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBocmFzZSBQaHJhc2UgZWxlbWVudHMgdG8gc3BlYWtcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwZWFrQnJvd3NlcihwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB2b2ljZU5hbWUgPSBlaXRoZXIoc2V0dGluZ3Mudm9pY2VOYW1lLCBSQUcuY29uZmlnLnNwZWVjaFZvaWNlKTtcclxuICAgICAgICBsZXQgdm9pY2UgICAgID0gdGhpcy5icm93c2VyVm9pY2VzW3ZvaWNlTmFtZV07XHJcblxyXG4gICAgICAgIC8vIFJlc2V0IHRvIGZpcnN0IHZvaWNlLCBpZiBjb25maWd1cmVkIGNob2ljZSBpcyBtaXNzaW5nXHJcbiAgICAgICAgaWYgKCF2b2ljZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBmaXJzdCA9IE9iamVjdC5rZXlzKHRoaXMuYnJvd3NlclZvaWNlcylbMF07XHJcbiAgICAgICAgICAgIHZvaWNlICAgICA9IHRoaXMuYnJvd3NlclZvaWNlc1tmaXJzdF07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBUaGUgcGhyYXNlIHRleHQgaXMgc3BsaXQgaW50byBzZW50ZW5jZXMsIGFzIHF1ZXVlaW5nIGxhcmdlIHNlbnRlbmNlcyB0aGF0IGxhc3RcclxuICAgICAgICAvLyBtYW55IHNlY29uZHMgY2FuIGJyZWFrIHNvbWUgVFRTIGVuZ2luZXMgYW5kIGJyb3dzZXJzLlxyXG4gICAgICAgIGxldCB0ZXh0ICA9IERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQocGhyYXNlKTtcclxuICAgICAgICBsZXQgcGFydHMgPSB0ZXh0LnNwbGl0KC9cXC5cXHMvaSk7XHJcblxyXG4gICAgICAgIHBhcnRzLmZvckVhY2goIChzZWdtZW50LCBpZHgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBBZGQgbWlzc2luZyBmdWxsIHN0b3AgdG8gZWFjaCBzZW50ZW5jZSBleGNlcHQgdGhlIGxhc3QsIHdoaWNoIGhhcyBpdFxyXG4gICAgICAgICAgICBpZiAoaWR4IDwgcGFydHMubGVuZ3RoIC0gMSlcclxuICAgICAgICAgICAgICAgIHNlZ21lbnQgKz0gJy4nO1xyXG5cclxuICAgICAgICAgICAgbGV0IHV0dGVyYW5jZSA9IG5ldyBTcGVlY2hTeW50aGVzaXNVdHRlcmFuY2Uoc2VnbWVudCk7XHJcblxyXG4gICAgICAgICAgICB1dHRlcmFuY2Uudm9pY2UgID0gdm9pY2U7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2x1bWUgPSBlaXRoZXIoc2V0dGluZ3Mudm9sdW1lLCBSQUcuY29uZmlnLnNwZWVjaFZvbCk7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS5waXRjaCAgPSBlaXRoZXIoc2V0dGluZ3MucGl0Y2gsICBSQUcuY29uZmlnLnNwZWVjaFBpdGNoKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnJhdGUgICA9IGVpdGhlcihzZXR0aW5ncy5yYXRlLCAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSk7XHJcblxyXG4gICAgICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFrKHV0dGVyYW5jZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUgaW1tZWRpYXRlbHkuIEkgZG9uJ3QgdHJ1c3Qgc3BlZWNoIGV2ZW50cyB0byBiZSByZWxpYWJsZTsgc2VlIGJlbG93LlxyXG4gICAgICAgIGlmICh0aGlzLm9uc3BlYWspXHJcbiAgICAgICAgICAgIHRoaXMub25zcGVhaygpO1xyXG5cclxuICAgICAgICAvLyBUaGlzIGNoZWNrcyBmb3Igd2hlbiB0aGUgbmF0aXZlIGVuZ2luZSBoYXMgc3RvcHBlZCBzcGVha2luZywgYW5kIGNhbGxzIHRoZVxyXG4gICAgICAgIC8vIG9uc3RvcCBldmVudCBoYW5kbGVyLiBJIGNvdWxkIHVzZSBTcGVlY2hTeW50aGVzaXMub25lbmQgaW5zdGVhZCwgYnV0IGl0IHdhc1xyXG4gICAgICAgIC8vIGZvdW5kIHRvIGJlIHVucmVsaWFibGUsIHNvIEkgaGF2ZSB0byBwb2xsIHRoZSBzcGVha2luZyBwcm9wZXJ0eSB0aGlzIHdheS5cclxuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuc3RvcFRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5zdG9wVGltZXIgPSBzZXRJbnRlcnZhbCgoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuc3BlYWtpbmcpXHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuc3RvcFRpbWVyKTtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgICAgIHRoaXMub25zdG9wKCk7XHJcbiAgICAgICAgfSwgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN5bnRoZXNpemVzIHZvaWNlIGJ5IHdhbGtpbmcgdGhyb3VnaCB0aGUgZ2l2ZW4gcGhyYXNlIGVsZW1lbnRzLCByZXNvbHZpbmcgcGFydHMgdG9cclxuICAgICAqIHNvdW5kIGZpbGUgSURzLCBhbmQgZmVlZGluZyB0aGUgZW50aXJlIGFycmF5IHRvIHRoZSB2b3ggZW5naW5lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaHJhc2UgUGhyYXNlIGVsZW1lbnRzIHRvIHNwZWFrXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgU2V0dGluZ3MgdG8gdXNlIGZvciB0aGUgdm9pY2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGVha1ZveChwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXNvbHZlciA9IG5ldyBSZXNvbHZlcihwaHJhc2UpO1xyXG4gICAgICAgIGxldCB2b3hQYXRoICA9IFJBRy5jb25maWcudm94UGF0aCB8fCBSQUcuY29uZmlnLnZveEN1c3RvbVBhdGg7XHJcblxyXG4gICAgICAgIHRoaXMudm94RW5naW5lIS5vbnNwZWFrID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9uc3BlYWspXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uc3BlYWsoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnZveEVuZ2luZSEub25zdG9wID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lIS5vbnNwZWFrID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICB0aGlzLnZveEVuZ2luZSEub25zdG9wICA9IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgICAgIHRoaXMub25zdG9wKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgc2V0dGluZ3MgZnJvbSBjb25maWcgaGVyZSwgdG8ga2VlcCBWT1ggZW5naW5lIGRlY291cGxlZCBmcm9tIFJBR1xyXG4gICAgICAgIHNldHRpbmdzLnZveFBhdGggICA9IGVpdGhlcihzZXR0aW5ncy52b3hQYXRoLCAgIHZveFBhdGgpO1xyXG4gICAgICAgIHNldHRpbmdzLnZveFJldmVyYiA9IGVpdGhlcihzZXR0aW5ncy52b3hSZXZlcmIsIFJBRy5jb25maWcudm94UmV2ZXJiKTtcclxuICAgICAgICBzZXR0aW5ncy52b3hDaGltZSAgPSBlaXRoZXIoc2V0dGluZ3Mudm94Q2hpbWUsICBSQUcuY29uZmlnLnZveENoaW1lKTtcclxuICAgICAgICBzZXR0aW5ncy52b2x1bWUgICAgPSBlaXRoZXIoc2V0dGluZ3Mudm9sdW1lLCAgICBSQUcuY29uZmlnLnNwZWVjaFZvbCk7XHJcbiAgICAgICAgc2V0dGluZ3MucmF0ZSAgICAgID0gZWl0aGVyKHNldHRpbmdzLnJhdGUsICAgICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlKTtcclxuXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUhLnNwZWFrKHJlc29sdmVyLnRvVm94KCksIHNldHRpbmdzKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBUeXBlIGRlZmluaXRpb24gZm9yIHNwZWVjaCBjb25maWcgb3ZlcnJpZGVzIHBhc3NlZCB0byB0aGUgc3BlYWsgbWV0aG9kICovXHJcbmludGVyZmFjZSBTcGVlY2hTZXR0aW5nc1xyXG57XHJcbiAgICAvKiogV2hldGhlciB0byBmb3JjZSB1c2Ugb2YgdGhlIFZPWCBlbmdpbmUgKi9cclxuICAgIHVzZVZveD8gICAgOiBib29sZWFuO1xyXG4gICAgLyoqIE92ZXJyaWRlIGFic29sdXRlIG9yIHJlbGF0aXZlIFVSTCBvZiBWT1ggdm9pY2UgdG8gdXNlICovXHJcbiAgICB2b3hQYXRoPyAgIDogc3RyaW5nO1xyXG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiByZXZlcmIgdG8gdXNlICovXHJcbiAgICB2b3hSZXZlcmI/IDogc3RyaW5nO1xyXG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiBjaGltZSB0byB1c2UgKi9cclxuICAgIHZveENoaW1lPyAgOiBzdHJpbmc7XHJcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIG5hdGl2ZSB2b2ljZSAqL1xyXG4gICAgdm9pY2VOYW1lPyA6IHN0cmluZztcclxuICAgIC8qKiBPdmVycmlkZSB2b2x1bWUgb2Ygdm9pY2UgKi9cclxuICAgIHZvbHVtZT8gICAgOiBudW1iZXI7XHJcbiAgICAvKiogT3ZlcnJpZGUgcGl0Y2ggb2Ygdm9pY2UgKi9cclxuICAgIHBpdGNoPyAgICAgOiBudW1iZXI7XHJcbiAgICAvKiogT3ZlcnJpZGUgcmF0ZSBvZiB2b2ljZSAqL1xyXG4gICAgcmF0ZT8gICAgICA6IG51bWJlcjtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbnR5cGUgVm94S2V5ID0gc3RyaW5nIHwgbnVtYmVyO1xyXG5cclxuLyoqIFN5bnRoZXNpemVzIHNwZWVjaCBieSBkeW5hbWljYWxseSBsb2FkaW5nIGFuZCBwaWVjaW5nIHRvZ2V0aGVyIHZvaWNlIGZpbGVzICovXHJcbmNsYXNzIFZveEVuZ2luZVxyXG57XHJcbiAgICAvKiogTGlzdCBvZiBpbXB1bHNlIHJlc3BvbnNlcyB0aGF0IGNvbWUgd2l0aCBSQUcgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgUkVWRVJCUyA6IERpY3Rpb25hcnk8c3RyaW5nPiA9IHtcclxuICAgICAgICAnJyAgICAgICAgICAgICAgICAgICAgIDogJ05vbmUnLFxyXG4gICAgICAgICdpci5zdGFsYmFucy53YXYnICAgICAgOiAnVGhlIExhZHkgQ2hhcGVsLCBTdCBBbGJhbnMgQ2F0aGVkcmFsJyxcclxuICAgICAgICAnaXIubWlkZGxlX3R1bm5lbC53YXYnIDogJ0lubm9jZW50IFJhaWx3YXkgVHVubmVsLCBFZGluYnVyZ2gnLFxyXG4gICAgICAgICdpci5ncmFuZ2UtY2VudHJlLndhdicgOiAnR3JhbmdlIHN0b25lIGNpcmNsZSwgQ291bnR5IExpbWVyaWNrJ1xyXG4gICAgfTtcclxuXHJcbiAgICAvKiogVGhlIGNvcmUgYXVkaW8gY29udGV4dCB0aGF0IGhhbmRsZXMgYXVkaW8gZWZmZWN0cyBhbmQgcGxheWJhY2sgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYXVkaW9Db250ZXh0IDogQXVkaW9Db250ZXh0O1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhbXBsaWZpZXMgb3IgYXR0ZW51YXRlcyB2b2ljZSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBnYWluTm9kZSAgICAgOiBHYWluTm9kZTtcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgYXBwbGllcyB0aGUgdGFubm95IGZpbHRlciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBmaWx0ZXJOb2RlICAgOiBCaXF1YWRGaWx0ZXJOb2RlO1xyXG4gICAgLyoqXHJcbiAgICAgKiBDYWNoZSBvZiBpbXB1bHNlIHJlc3BvbnNlcyByZXZlcmIgbm9kZXMsIGZvciByZXZlcmIuIFRoaXMgdXNlZCB0byBiZSBhIGRpY3Rpb25hcnlcclxuICAgICAqIG9mIEF1ZGlvQnVmZmVycywgYnV0IENvbnZvbHZlck5vZGVzIGNhbm5vdCBoYXZlIHRoZWlyIGJ1ZmZlcnMgY2hhbmdlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbXB1bHNlcyA6IERpY3Rpb25hcnk8Q29udm9sdmVyTm9kZT4gPSB7fTtcclxuICAgIC8qKiBSZWxhdGl2ZSBwYXRoIHRvIGZldGNoIGltcHVsc2UgcmVzcG9uc2UgYW5kIGNoaW1lIGZpbGVzIGZyb20gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZGF0YVBhdGggOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBhdWRpYmx5IGJlZ3VuICovXHJcbiAgICBwdWJsaWMgIG9uc3BlYWs/ICAgICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBlbmRlZCAqL1xyXG4gICAgcHVibGljICBvbnN0b3A/ICAgICAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgZW5naW5lIGlzIGN1cnJlbnRseSBydW5uaW5nIGFuZCBzcGVha2luZyAqL1xyXG4gICAgcHVibGljICBpc1NwZWFraW5nICAgICAgIDogYm9vbGVhbiAgICAgID0gZmFsc2U7XHJcbiAgICAvKiogV2hldGhlciB0aGlzIGVuZ2luZSBoYXMgYmVndW4gc3BlYWtpbmcgZm9yIGEgY3VycmVudCBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgYmVndW5TcGVha2luZyAgICA6IGJvb2xlYW4gICAgICA9IGZhbHNlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSBudW1iZXIgZm9yIHRoZSBjdXJyZW50IHB1bXAgdGltZXIgKi9cclxuICAgIHByaXZhdGUgcHVtcFRpbWVyICAgICAgICA6IG51bWJlciAgICAgICA9IDA7XHJcbiAgICAvKiogVHJhY2tzIHRoZSBhdWRpbyBjb250ZXh0J3Mgd2FsbC1jbG9jayB0aW1lIHRvIHNjaGVkdWxlIG5leHQgY2xpcCAqL1xyXG4gICAgcHJpdmF0ZSBuZXh0QmVnaW4gICAgICAgIDogbnVtYmVyICAgICAgID0gMDtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGN1cnJlbnRseSBwZW5kaW5nIHJlcXVlc3RzLCBhcyBhIEZJRk8gcXVldWUgKi9cclxuICAgIHByaXZhdGUgcGVuZGluZ1JlcXMgICAgICA6IFZveFJlcXVlc3RbXSA9IFtdO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHNjaGVkdWxlZCBhdWRpbyBidWZmZXJzICovXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlZEJ1ZmZlcnMgOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGVbXSA9IFtdO1xyXG4gICAgLyoqIExpc3Qgb2Ygdm94IElEcyBjdXJyZW50bHkgYmVpbmcgcnVuIHRocm91Z2ggKi9cclxuICAgIHByaXZhdGUgY3VycmVudElkcz8gICAgICA6IFZveEtleVtdO1xyXG4gICAgLyoqIFNwZWVjaCBzZXR0aW5ncyBjdXJyZW50bHkgYmVpbmcgdXNlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50U2V0dGluZ3M/IDogU3BlZWNoU2V0dGluZ3M7XHJcbiAgICAvKiogUmV2ZXJiIG5vZGUgY3VycmVudGx5IGJlaW5nIHVzZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFJldmVyYj8gICA6IENvbnZvbHZlck5vZGU7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGRhdGFQYXRoOiBzdHJpbmcgPSAnZGF0YS92b3gnKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNldHVwIHRoZSBjb3JlIGF1ZGlvIGNvbnRleHRcclxuXHJcbiAgICAgICAgLy8gQHRzLWlnbm9yZSAtIERlZmluaW5nIHRoZXNlIGluIFdpbmRvdyBpbnRlcmZhY2UgZG9lcyBub3Qgd29ya1xyXG4gICAgICAgIGxldCBhdWRpb0NvbnRleHQgID0gd2luZG93LkF1ZGlvQ29udGV4dCB8fCB3aW5kb3cud2Via2l0QXVkaW9Db250ZXh0O1xyXG4gICAgICAgIHRoaXMuYXVkaW9Db250ZXh0ID0gbmV3IGF1ZGlvQ29udGV4dCgpO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuYXVkaW9Db250ZXh0KVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBnZXQgYXVkaW8gY29udGV4dCcpO1xyXG5cclxuICAgICAgICAvLyBTZXR1cCBub2Rlc1xyXG5cclxuICAgICAgICB0aGlzLmRhdGFQYXRoICAgPSBkYXRhUGF0aDtcclxuICAgICAgICB0aGlzLmdhaW5Ob2RlICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS50eXBlICAgICAgPSAnaGlnaHBhc3MnO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS5RLnZhbHVlICAgPSAwLjQ7XHJcblxyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUuY29ubmVjdCh0aGlzLmZpbHRlck5vZGUpO1xyXG4gICAgICAgIC8vIFJlc3Qgb2Ygbm9kZXMgZ2V0IGNvbm5lY3RlZCB3aGVuIHNwZWFrIGlzIGNhbGxlZFxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQmVnaW5zIGxvYWRpbmcgYW5kIHNwZWFraW5nIGEgc2V0IG9mIHZveCBmaWxlcy4gU3RvcHMgYW55IHNwZWVjaC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWRzIExpc3Qgb2Ygdm94IGlkcyB0byBsb2FkIGFzIGZpbGVzLCBpbiBzcGVha2luZyBvcmRlclxyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFZvaWNlIHNldHRpbmdzIHRvIHVzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3BlYWsoaWRzOiBWb3hLZXlbXSwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggU1BFQUs6JywgaWRzLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIC8vIFNldCBzdGF0ZVxyXG5cclxuICAgICAgICBpZiAodGhpcy5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICB0aGlzLnN0b3AoKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nICAgICAgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuYmVndW5TcGVha2luZyAgID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgPSBpZHM7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSBzZXR0aW5ncztcclxuXHJcbiAgICAgICAgLy8gU2V0IHJldmVyYlxyXG5cclxuICAgICAgICBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eShzZXR0aW5ncy52b3hSZXZlcmIpIClcclxuICAgICAgICAgICAgdGhpcy5zZXRSZXZlcmIoKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZmlsZSAgID0gc2V0dGluZ3Mudm94UmV2ZXJiITtcclxuICAgICAgICAgICAgbGV0IHJldmVyYiA9IHRoaXMuaW1wdWxzZXNbZmlsZV07XHJcblxyXG4gICAgICAgICAgICBpZiAoIXJldmVyYilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHJldmVyYiBpcyBvZmYgZmlyc3QsIGVsc2UgY2xpcHMgd2lsbCBxdWV1ZSBpbiB0aGUgYXVkaW9cclxuICAgICAgICAgICAgICAgIC8vIGJ1ZmZlciBhbmQgYWxsIHN1ZGRlbmx5IHBsYXkgYXQgdGhlIHNhbWUgdGltZSwgd2hlbiByZXZlcmIgbG9hZHMuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFJldmVyYigpO1xyXG5cclxuICAgICAgICAgICAgICAgIGZldGNoKGAke3RoaXMuZGF0YVBhdGh9LyR7ZmlsZX1gKVxyXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKCByZXMgPT4gcmVzLmFycmF5QnVmZmVyKCkgKVxyXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKCBidWYgPT4gU291bmRzLmRlY29kZSh0aGlzLmF1ZGlvQ29udGV4dCwgYnVmKSApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIGltcCA9PiB0aGlzLmNyZWF0ZVJldmVyYihmaWxlLCBpbXApICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRSZXZlcmIocmV2ZXJiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNldCB2b2x1bWVcclxuXHJcbiAgICAgICAgbGV0IHZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIDEpO1xyXG5cclxuICAgICAgICAvLyBSZW1hcHMgdGhlIDEuMS4uLjEuOSByYW5nZSB0byAyLi4uMTBcclxuICAgICAgICBpZiAodm9sdW1lID4gMSlcclxuICAgICAgICAgICAgdm9sdW1lID0gKHZvbHVtZSAqIDEwKSAtIDk7XHJcblxyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGNoaW1lLCBhdCBmb3JjZWQgcGxheWJhY2sgcmF0ZSBvZiAxXHJcblxyXG4gICAgICAgIGlmICggIVN0cmluZ3MuaXNOdWxsT3JFbXB0eShzZXR0aW5ncy52b3hDaGltZSkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBhdGggICAgICA9IGAke3RoaXMuZGF0YVBhdGh9LyR7c2V0dGluZ3Mudm94Q2hpbWUhfWA7XHJcbiAgICAgICAgICAgIGxldCByZXEgICAgICAgPSBuZXcgVm94UmVxdWVzdChwYXRoLCAwLCB0aGlzLmF1ZGlvQ29udGV4dCk7XHJcbiAgICAgICAgICAgIHJlcS5mb3JjZVJhdGUgPSAxO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5wdXNoKHJlcSk7XHJcbiAgICAgICAgICAgIGlkcy51bnNoaWZ0KDEuMCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCZWdpbiB0aGUgcHVtcCBsb29wLiBPbiBpT1MsIHRoZSBjb250ZXh0IG1heSBoYXZlIHRvIGJlIHJlc3VtZWQgZmlyc3RcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSAnc3VzcGVuZGVkJylcclxuICAgICAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCkudGhlbiggKCkgPT4gdGhpcy5wdW1wKCkgKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMucHVtcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyBwbGF5aW5nIGFueSBjdXJyZW50bHkgc3Bva2VuIHNwZWVjaCBhbmQgcmVzZXRzIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIEFscmVhZHkgc3RvcHBlZD8gRG8gbm90IGNvbnRpbnVlXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gU3RvcCBwdW1waW5nXHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucHVtcFRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbGwgcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMuZm9yRWFjaCggciA9PiByLmNhbmNlbCgpICk7XHJcblxyXG4gICAgICAgIC8vIEtpbGwgYW5kIGRlcmVmZXJlbmNlIGFueSBjdXJyZW50bHkgcGxheWluZyBmaWxlXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmZvckVhY2gobm9kZSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbm9kZS5zdG9wKCk7XHJcbiAgICAgICAgICAgIG5vZGUuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm5leHRCZWdpbiAgICAgICAgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyAgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcyAgICAgID0gW107XHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzID0gW107XHJcblxyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTVE9QUEVEJyk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFB1bXBzIHRoZSBzcGVlY2ggcXVldWUsIGJ5IGtlZXBpbmcgdXAgdG8gMTAgZmV0Y2ggcmVxdWVzdHMgZm9yIHZvaWNlIGZpbGVzIGdvaW5nLFxyXG4gICAgICogYW5kIHRoZW4gZmVlZGluZyB0aGVpciBkYXRhIChpbiBlbmZvcmNlZCBvcmRlcikgdG8gdGhlIGF1ZGlvIGNoYWluLCBvbmUgYXQgYSB0aW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHB1bXAoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBJZiB0aGUgZW5naW5lIGhhcyBzdG9wcGVkLCBkbyBub3QgcHJvY2VlZC5cclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZyB8fCAhdGhpcy5jdXJyZW50SWRzIHx8ICF0aGlzLmN1cnJlbnRTZXR0aW5ncylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGaXJzdCwgc2NoZWR1bGUgZnVsZmlsbGVkIHJlcXVlc3RzIGludG8gdGhlIGF1ZGlvIGJ1ZmZlciwgaW4gRklGTyBvcmRlclxyXG4gICAgICAgIHRoaXMuc2NoZWR1bGUoKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZmlsbCBhbnkgZnJlZSBwZW5kaW5nIHNsb3RzIHdpdGggbmV3IHJlcXVlc3RzXHJcbiAgICAgICAgbGV0IG5leHREZWxheSA9IDA7XHJcblxyXG4gICAgICAgIHdoaWxlICh0aGlzLmN1cnJlbnRJZHNbMF0gJiYgdGhpcy5wZW5kaW5nUmVxcy5sZW5ndGggPCAxMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSB0aGlzLmN1cnJlbnRJZHMuc2hpZnQoKSE7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB0aGlzIGtleSBpcyBhIG51bWJlciwgaXQncyBhbiBhbW91bnQgb2Ygc2lsZW5jZSwgc28gYWRkIGl0IGFzIHRoZVxyXG4gICAgICAgICAgICAvLyBwbGF5YmFjayBkZWxheSBmb3IgdGhlIG5leHQgcGxheWFibGUgcmVxdWVzdCAoaWYgYW55KS5cclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBrZXkgPT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuZXh0RGVsYXkgKz0ga2V5O1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGxldCBwYXRoID0gYCR7dGhpcy5jdXJyZW50U2V0dGluZ3Mudm94UGF0aH0vJHtrZXl9Lm1wM2A7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2goIG5ldyBWb3hSZXF1ZXN0KHBhdGgsIG5leHREZWxheSwgdGhpcy5hdWRpb0NvbnRleHQpICk7XHJcbiAgICAgICAgICAgIG5leHREZWxheSA9IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmcgd2hlbiB3ZSdyZSBvdXQgb2YgSURzIHRvIHF1ZXVlIGFuZCBub3RoaW5nIGlzIHBsYXlpbmdcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50SWRzLmxlbmd0aCAgICAgICA8PSAwKVxyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPD0gMClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLnB1bXBUaW1lciA9IHNldFRpbWVvdXQodGhpcy5wdW1wLmJpbmQodGhpcyksIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzY2hlZHVsZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFN0b3Agc2NoZWR1bGluZyBpZiB0aGVyZSBhcmUgbm8gcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIGlmICghdGhpcy5wZW5kaW5nUmVxc1swXSB8fCAhdGhpcy5wZW5kaW5nUmVxc1swXS5pc0RvbmUpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gRG9uJ3Qgc2NoZWR1bGUgaWYgbW9yZSB0aGFuIDUgbm9kZXMgYXJlLCBhcyBub3QgdG8gYmxvdyBhbnkgYnVmZmVyc1xyXG4gICAgICAgIGlmICh0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMubGVuZ3RoID4gNSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgcmVxID0gdGhpcy5wZW5kaW5nUmVxcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIG5leHQgcmVxdWVzdCBlcnJvcmVkIG91dCAoYnVmZmVyIG1pc3NpbmcpLCBza2lwIGl0XHJcbiAgICAgICAgaWYgKCFyZXEuYnVmZmVyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIFNLSVBQRUQ6JywgcmVxLnBhdGgpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY2hlZHVsZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhpcyBpcyB0aGUgZmlyc3QgY2xpcCBiZWluZyBwbGF5ZWQsIHN0YXJ0IGZyb20gY3VycmVudCB3YWxsLWNsb2NrXHJcbiAgICAgICAgaWYgKHRoaXMubmV4dEJlZ2luID09PSAwKVxyXG4gICAgICAgICAgICB0aGlzLm5leHRCZWdpbiA9IHRoaXMuYXVkaW9Db250ZXh0LmN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgUVVFVUVEOicsIHJlcS5wYXRoLCByZXEuYnVmZmVyLmR1cmF0aW9uLCB0aGlzLm5leHRCZWdpbik7XHJcblxyXG4gICAgICAgIC8vIEJhc2UgbGF0ZW5jeSBub3QgYXZhaWxhYmxlIGluIHNvbWUgYnJvd3NlcnNcclxuICAgICAgICBsZXQgbGF0ZW5jeSA9ICh0aGlzLmF1ZGlvQ29udGV4dC5iYXNlTGF0ZW5jeSB8fCAwLjAxKSArIDAuMTU7XHJcbiAgICAgICAgbGV0IG5vZGUgICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICBsZXQgcmF0ZSAgICA9IHJlcS5mb3JjZVJhdGUgfHwgdGhpcy5jdXJyZW50U2V0dGluZ3MhLnJhdGUgfHwgMTtcclxuICAgICAgICBub2RlLmJ1ZmZlciA9IHJlcS5idWZmZXI7XHJcblxyXG4gICAgICAgIC8vIFJlbWFwIHJhdGUgZnJvbSAwLjEuLjEuOSB0byAwLjguLjEuNVxyXG4gICAgICAgIGlmICAgICAgKHJhdGUgPCAxKSByYXRlID0gKHJhdGUgKiAwLjIpICsgMC44O1xyXG4gICAgICAgIGVsc2UgaWYgKHJhdGUgPiAxKSByYXRlID0gKHJhdGUgKiAwLjUpICsgMC41O1xyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgZGVsYXkgYW5kIGR1cmF0aW9uIGJhc2VkIG9uIHBsYXliYWNrIHJhdGVcclxuICAgICAgICBsZXQgZGVsYXkgICAgPSByZXEuZGVsYXkgKiAoMSAvIHJhdGUpO1xyXG4gICAgICAgIGxldCBkdXJhdGlvbiA9IG5vZGUuYnVmZmVyLmR1cmF0aW9uICogKDEgLyByYXRlKTtcclxuXHJcbiAgICAgICAgbm9kZS5wbGF5YmFja1JhdGUudmFsdWUgPSByYXRlO1xyXG4gICAgICAgIG5vZGUuY29ubmVjdCh0aGlzLmdhaW5Ob2RlKTtcclxuICAgICAgICBub2RlLnN0YXJ0KHRoaXMubmV4dEJlZ2luICsgZGVsYXkpO1xyXG5cclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMucHVzaChub2RlKTtcclxuICAgICAgICB0aGlzLm5leHRCZWdpbiArPSAoZHVyYXRpb24gKyBkZWxheSAtIGxhdGVuY3kpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIG9uLWZpcnN0LXNwZWFrIGV2ZW50XHJcbiAgICAgICAgaWYgKCF0aGlzLmJlZ3VuU3BlYWtpbmcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJlZ3VuU3BlYWtpbmcgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub25zcGVhaylcclxuICAgICAgICAgICAgICAgIHRoaXMub25zcGVhaygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGF2ZSB0aGlzIGJ1ZmZlciBub2RlIHJlbW92ZSBpdHNlbGYgZnJvbSB0aGUgc2NoZWR1bGUgd2hlbiBkb25lXHJcbiAgICAgICAgbm9kZS5vbmVuZGVkID0gXyA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIEVOREVEOicsIHJlcS5wYXRoKTtcclxuICAgICAgICAgICAgbGV0IGlkeCA9IHRoaXMuc2NoZWR1bGVkQnVmZmVycy5pbmRleE9mKG5vZGUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGlkeCAhPT0gLTEpXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuc3BsaWNlKGlkeCwgMSk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZVJldmVyYihmaWxlOiBzdHJpbmcsIGltcHVsc2U6IEF1ZGlvQnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmltcHVsc2VzW2ZpbGVdICAgICAgICAgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUNvbnZvbHZlcigpO1xyXG4gICAgICAgIHRoaXMuaW1wdWxzZXNbZmlsZV0uYnVmZmVyICAgID0gaW1wdWxzZTtcclxuICAgICAgICB0aGlzLmltcHVsc2VzW2ZpbGVdLm5vcm1hbGl6ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5zZXRSZXZlcmIodGhpcy5pbXB1bHNlc1tmaWxlXSk7XHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFVkVSQiBMT0FERUQ6JywgZmlsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRSZXZlcmIocmV2ZXJiPzogQ29udm9sdmVyTm9kZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFJldmVyYilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFJldmVyYi5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFJldmVyYiA9IHVuZGVmaW5lZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS5kaXNjb25uZWN0KCk7XHJcblxyXG4gICAgICAgIGlmIChyZXZlcmIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRSZXZlcmIgPSByZXZlcmI7XHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyTm9kZS5jb25uZWN0KHJldmVyYik7XHJcbiAgICAgICAgICAgIHJldmVyYi5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmZpbHRlck5vZGUuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHJlcXVlc3QgZm9yIGEgdm94IGZpbGUsIGltbWVkaWF0ZWx5IGJlZ3VuIG9uIGNyZWF0aW9uICovXHJcbmNsYXNzIFZveFJlcXVlc3Rcclxue1xyXG4gICAgLyoqIFJlbGF0aXZlIHJlbW90ZSBwYXRoIG9mIHRoaXMgdm9pY2UgZmlsZSByZXF1ZXN0ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHBhdGggICAgOiBzdHJpbmc7XHJcbiAgICAvKiogQW1vdW50IG9mIHNlY29uZHMgdG8gZGVsYXkgdGhlIHBsYXliYWNrIG9mIHRoaXMgcmVxdWVzdCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBkZWxheSAgIDogbnVtYmVyO1xyXG4gICAgLyoqIEF1ZGlvIGNvbnRleHQgdG8gdXNlIGZvciBkZWNvZGluZyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0IDogQXVkaW9Db250ZXh0O1xyXG4gICAgLyoqIEFib3J0IGNvbnRyb2xsZXIgdG8gYWxsb3cgdGhlIGZldGNoIHRvIGJlIGFib3J0ZWQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYWJvcnQgICA6IEFib3J0Q29udHJvbGxlcjtcclxuXHJcbiAgICAvKiogV2hldGhlciB0aGlzIHJlcXVlc3QgaXMgZG9uZSBhbmQgcmVhZHkgZm9yIGhhbmRsaW5nIChldmVuIGlmIGZhaWxlZCkgKi9cclxuICAgIHB1YmxpYyBpc0RvbmUgICAgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFJhdyBhdWRpbyBkYXRhIGZyb20gdGhlIGxvYWRlZCBmaWxlLCBpZiBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBidWZmZXI/ICAgIDogQXVkaW9CdWZmZXI7XHJcbiAgICAvKiogUGxheWJhY2sgcmF0ZSB0byBmb3JjZSB0aGlzIGNsaXAgdG8gcGxheSBhdCAqL1xyXG4gICAgcHVibGljIGZvcmNlUmF0ZT8gOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgZGVsYXk6IG51bWJlciwgY29udGV4dDogQXVkaW9Db250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBSRVFVRVNUOicsIHBhdGgpO1xyXG4gICAgICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5wYXRoICAgID0gcGF0aDtcclxuICAgICAgICB0aGlzLmRlbGF5ICAgPSBkZWxheTtcclxuICAgICAgICB0aGlzLmFib3J0ICAgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XHJcblxyXG4gICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3dlYi91cGRhdGVzLzIwMTcvMDkvYWJvcnRhYmxlLWZldGNoXHJcbiAgICAgICAgZmV0Y2gocGF0aCwgeyBzaWduYWwgOiB0aGlzLmFib3J0LnNpZ25hbCB9KVxyXG4gICAgICAgICAgICAudGhlbiAoIHRoaXMub25GdWxmaWxsLmJpbmQodGhpcykgKVxyXG4gICAgICAgICAgICAuY2F0Y2goIHRoaXMub25FcnJvci5iaW5kKHRoaXMpICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGltZW91dCBhbGwgZmV0Y2hlcyBieSAxMCBzZWNvbmRzXHJcbiAgICAgICAgc2V0VGltZW91dChfID0+IHRoaXMuYWJvcnQuYWJvcnQoKSwgMTAgKiAxMDAwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FuY2VscyB0aGlzIHJlcXVlc3QgZnJvbSBwcm9jZWVkaW5nIGFueSBmdXJ0aGVyICovXHJcbiAgICBwdWJsaWMgY2FuY2VsKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5hYm9ydC5hYm9ydCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBCZWdpbnMgZGVjb2RpbmcgdGhlIGxvYWRlZCBNUDMgdm9pY2UgZmlsZSB0byByYXcgYXVkaW8gZGF0YSAqL1xyXG4gICAgcHJpdmF0ZSBvbkZ1bGZpbGwocmVzOiBSZXNwb25zZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFyZXMub2spXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKGBWT1ggTk9UIEZPVU5EOiAke3Jlcy5zdGF0dXN9IEAgJHt0aGlzLnBhdGh9YCk7XHJcblxyXG4gICAgICAgIHJlcy5hcnJheUJ1ZmZlcigpLnRoZW4oIHRoaXMub25BcnJheUJ1ZmZlci5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRha2VzIHRoZSBhcnJheSBidWZmZXIgZnJvbSB0aGUgZnVsZmlsbGVkIGZldGNoIGFuZCBkZWNvZGVzIGl0ICovXHJcbiAgICBwcml2YXRlIG9uQXJyYXlCdWZmZXIoYnVmZmVyOiBBcnJheUJ1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU291bmRzLmRlY29kZSh0aGlzLmNvbnRleHQsIGJ1ZmZlcilcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRGVjb2RlLmJpbmQodGhpcykgKVxyXG4gICAgICAgICAgICAuY2F0Y2goIHRoaXMub25FcnJvci5iaW5kKHRoaXMpICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiB0aGUgZmV0Y2hlZCBidWZmZXIgaXMgZGVjb2RlZCBzdWNjZXNzZnVsbHkgKi9cclxuICAgIHByaXZhdGUgb25EZWNvZGUoYnVmZmVyOiBBdWRpb0J1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5idWZmZXIgPSBidWZmZXI7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgaWYgdGhlIGZldGNoIG9yIGRlY29kZSBzdGFnZXMgZmFpbCAqL1xyXG4gICAgcHJpdmF0ZSBvbkVycm9yKGVycjogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnUkVRVUVTVCBGQUlMOicsIGVycik7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8gVE9ETzogTWFrZSBhbGwgdmlld3MgdXNlIHRoaXMgY2xhc3NcclxuLyoqIEJhc2UgY2xhc3MgZm9yIGEgdmlldzsgYW55dGhpbmcgd2l0aCBhIGJhc2UgRE9NIGVsZW1lbnQgKi9cclxuYWJzdHJhY3QgY2xhc3MgVmlld0Jhc2Vcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHZpZXcncyBwcmltYXJ5IERPTSBlbGVtZW50ICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgdGhpcyBiYXNlIHZpZXcsIGF0dGFjaGluZyBpdCB0byB0aGUgZWxlbWVudCBtYXRjaGluZyB0aGUgZ2l2ZW4gcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3Rvcihkb21RdWVyeTogc3RyaW5nIHwgSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBkb21RdWVyeSA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tID0gRE9NLnJlcXVpcmUoZG9tUXVlcnkpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5kb20gPSBkb21RdWVyeTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGlzIHZpZXcncyBjaGlsZCBlbGVtZW50IG1hdGNoaW5nIHRoZSBnaXZlbiBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGF0dGFjaDxUIGV4dGVuZHMgSFRNTEVsZW1lbnQ+KHF1ZXJ5OiBzdHJpbmcpIDogVFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBET00ucmVxdWlyZShxdWVyeSwgdGhpcy5kb20pO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwidmlld0Jhc2UudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGRpc2NsYWltZXIgc2NyZWVuICovXHJcbmNsYXNzIERpc2NsYWltZXIgZXh0ZW5kcyBWaWV3QmFzZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBcImNvbnRpbnVlXCIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkRpc21pc3MgOiBIVE1MQnV0dG9uRWxlbWVudCA9IHRoaXMuYXR0YWNoKCcjYnRuRGlzbWlzcycpO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGxhc3QgZm9jdXNlZCBlbGVtZW50LCBpZiBhbnkgKi9cclxuICAgIHByaXZhdGUgbGFzdEFjdGl2ZT8gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCcjZGlzY2xhaW1lclNjcmVlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBPcGVucyB0aGUgZGlzY2xhaW1lciBmb3IgZmlyc3QgdGltZSB1c2VycyAqL1xyXG4gICAgcHVibGljIGRpc2NsYWltKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKFJBRy5jb25maWcucmVhZERpc2NsYWltZXIpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5sYXN0QWN0aXZlICAgICAgICAgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIFJBRy52aWV3cy5tYWluLmhpZGRlbiAgID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gICAgICAgICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuRGlzbWlzcy5vbmNsaWNrID0gdGhpcy5vbkRpc21pc3MuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bkRpc21pc3MuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGVyc2lzdHMgdGhlIGRpc21pc3NhbCB0byBzdG9yYWdlIGFuZCByZXN0b3JlcyB0aGUgdmlldyB1bmRlcm5lYXRoICovXHJcbiAgICBwcml2YXRlIG9uRGlzbWlzcygpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5jb25maWcucmVhZERpc2NsYWltZXIgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiAgICAgICAgICAgPSB0cnVlO1xyXG4gICAgICAgIC8vIERhc2hib2FyZCByb2xlOiB0aGUgZWRpdG9yIHZpZXcgc3RheXMgaGlkZGVuIOKAlCB0aGUgcGFuZWwgaXMgd2hhdFxyXG4gICAgICAgIC8vIHNob3dzLiBTY3JlZW4gcm9sZTogcmVzdG9yZSB0aGUgbWFycXVlZSBlZGl0b3IuXHJcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuICAgICA9IFJBRy5pc0Rhc2hib2FyZFJvbGUoKTtcclxuICAgICAgICB0aGlzLmJ0bkRpc21pc3Mub25jbGljayAgID0gbnVsbDtcclxuICAgICAgICBSQUcuY29uZmlnLnNhdmUoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMubGFzdEFjdGl2ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEFjdGl2ZS5mb2N1cygpO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RBY3RpdmUgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwaHJhc2UgZWRpdG9yICovXHJcbmNsYXNzIEVkaXRvclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gY29udGFpbmVyIGZvciB0aGUgZWRpdG9yICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBkaWFsb2csIGlmIGFueSAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50UGlja2VyPyA6IFBpY2tlcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBocmFzZSBlbGVtZW50IGN1cnJlbnRseSBiZWluZyBlZGl0ZWQsIGlmIGFueSAqL1xyXG4gICAgLy8gRG8gbm90IERSWTsgbmVlZHMgdG8gYmUgcGFzc2VkIHRvIHRoZSBwaWNrZXIgZm9yIGNsZWFuZXIgY29kZVxyXG4gICAgcHJpdmF0ZSBkb21FZGl0aW5nPyAgICA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gPSBET00ucmVxdWlyZSgnI2VkaXRvcicpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5ib2R5Lm9uY2xpY2sgPSB0aGlzLm9uQ2xpY2suYmluZCh0aGlzKTtcclxuICAgICAgICB3aW5kb3cub25yZXNpemUgICAgICAgPSB0aGlzLm9uUmVzaXplLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20ub25zY3JvbGwgICAgID0gdGhpcy5vblNjcm9sbC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tLnRleHRDb250ZW50ICA9IEwuRURJVE9SX0lOSVQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcGxhY2VzIHRoZSBlZGl0b3Igd2l0aCBhIHJvb3QgcGhyYXNlc2V0IHJlZmVyZW5jZSwgYW5kIGV4cGFuZHMgaXQgaW50byBIVE1MICovXHJcbiAgICBwdWJsaWMgZ2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5pbm5lckhUTUwgPSAnPHBocmFzZXNldCByZWY9XCJyb290XCIgLz4nO1xyXG5cclxuICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmF0dGFjaENvbnRyb2xzKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzY3JvbGwtcGFzdCBwYWRkaW5nIHVuZGVyIHRoZSBwaHJhc2VcclxuICAgICAgICBsZXQgcGFkZGluZyAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBwYWRkaW5nLmNsYXNzTmFtZSA9ICdib3R0b21QYWRkaW5nJztcclxuXHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQocGFkZGluZyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcHJvY2Vzc2VzIGFsbCBwaHJhc2VzZXQgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHJlZiwgaWYgdGhlaXIgaW5kZXggaGFzIGNoYW5nZWQgKi9cclxuICAgIHB1YmxpYyByZWZyZXNoUGhyYXNlc2V0KHJlZjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlLCB0aGlzIGNvdWxkIHBvdGVudGlhbGx5IGJ1ZyBvdXQgaWYgYSBwaHJhc2VzZXQncyBkZXNjZW5kYW50IHJlZmVyZW5jZXNcclxuICAgICAgICAvLyB0aGUgc2FtZSBwaHJhc2VzZXQgKHJlY3Vyc2lvbikuIEJ1dCB0aGlzIGlzIG9rYXkgYmVjYXVzZSBwaHJhc2VzZXRzIHNob3VsZFxyXG4gICAgICAgIC8vIG5ldmVyIGluY2x1ZGUgdGhlbXNlbHZlcywgZXZlbiBldmVudHVhbGx5LlxyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuW2RhdGEtdHlwZT1waHJhc2VzZXRdW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50ICAgID0gXyBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncGhyYXNlc2V0Jyk7XHJcbiAgICAgICAgICAgICAgICBsZXQgY2hhbmNlICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY2hhbmNlJ107XHJcblxyXG4gICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JlZicsIHJlZik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGNoYW5jZSlcclxuICAgICAgICAgICAgICAgICAgICBuZXdFbGVtZW50LnNldEF0dHJpYnV0ZSgnY2hhbmNlJywgY2hhbmNlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MobmV3RWxlbWVudC5wYXJlbnRFbGVtZW50ISk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF0dGFjaENvbnRyb2xzKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHN0YXRpYyBOb2RlTGlzdCBvZiBhbGwgcGhyYXNlIGVsZW1lbnRzIG9mIHRoZSBnaXZlbiBxdWVyeS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgUXVlcnkgc3RyaW5nIHRvIGFkZCBvbnRvIHRoZSBgc3BhbmAgc2VsZWN0b3JcclxuICAgICAqIEByZXR1cm5zIE5vZGUgbGlzdCBvZiBhbGwgZWxlbWVudHMgbWF0Y2hpbmcgdGhlIGdpdmVuIHNwYW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldEVsZW1lbnRzQnlRdWVyeShxdWVyeTogc3RyaW5nKSA6IE5vZGVMaXN0XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW4ke3F1ZXJ5fWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSdzIHJvb3QgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSBpbiB0aGUgZWRpdG9yIGFzIHRleHQsIGV4Y2x1ZGluZyB0aGUgaGlkZGVuIHBhcnRzICovXHJcbiAgICBwdWJsaWMgZ2V0VGV4dCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gdHlwZSwgYW5kIHNldHMgdGhlaXIgdGV4dCB0byBnaXZlbiB2YWx1ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdHlwZSBPcmlnaW5hbCBYTUwgbmFtZSBvZiBlbGVtZW50cyB0byByZXBsYWNlIGNvbnRlbnRzIG9mXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgTmV3IHRleHQgZm9yIHRoZSBmb3VuZCBlbGVtZW50cyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEVsZW1lbnRzVGV4dCh0eXBlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPSR7dHlwZX1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgYW55IGN1cnJlbnRseSBvcGVuIGVkaXRvciBkaWFsb2dzICovXHJcbiAgICBwdWJsaWMgY2xvc2VEaWFsb2coKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIuY2xvc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5yZW1vdmVBdHRyaWJ1dGUoJ2VkaXRpbmcnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJywgJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBhdHRhY2hlcyBVSSBjb250cm9scyBmb3IgY2VydGFpbiBwaHJhc2UgZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgYXR0YWNoQ29udHJvbHMoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS10eXBlPXBocmFzZXNldF0nKS5mb3JFYWNoKHNwYW4gPT5cclxuICAgICAgICAgICAgUGhyYXNlc2V0QnV0dG9uLmNyZWF0ZUFuZEF0dGFjaChzcGFuKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWNoYW5jZV0nKS5mb3JFYWNoKHNwYW4gPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLmNyZWF0ZUFuZEF0dGFjaChzcGFuKTtcclxuICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUudXBkYXRlKHNwYW4gYXMgSFRNTEVsZW1lbnQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGEgY2xpY2sgYW55d2hlcmUgaW4gdGhlIHdpbmRvdyBkZXBlbmRpbmcgb24gdGhlIGNvbnRleHQgKi9cclxuICAgIHByaXZhdGUgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgdHlwZSAgID0gdGFyZ2V0ID8gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXSAgICA6IHVuZGVmaW5lZDtcclxuICAgICAgICBsZXQgcGlja2VyID0gdHlwZSAgID8gUkFHLnZpZXdzLmdldFBpY2tlcih0eXBlKSA6IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKCF0YXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNsb3NlRGlhbG9nKCk7XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3Mgb2YgaW5uZXIgZWxlbWVudHNcclxuICAgICAgICBpZiAoIHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2lubmVyJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGlubmVyIGRvY3VtZW50IG9yIHVub3duZWQgZWxlbWVudFxyXG4gICAgICAgIGlmICggIWRvY3VtZW50LmJvZHkuY29udGFpbnModGFyZ2V0KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGNsaWNrcyB0byBhbnkgZWxlbWVudCBvZiBhbHJlYWR5IG9wZW4gcGlja2Vyc1xyXG4gICAgICAgIGlmICggdGhpcy5jdXJyZW50UGlja2VyIClcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlci5kb20uY29udGFpbnModGFyZ2V0KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gQ2FuY2VsIGFueSBvcGVuIGVkaXRvcnNcclxuICAgICAgICBsZXQgcHJldlRhcmdldCA9IHRoaXMuZG9tRWRpdGluZztcclxuICAgICAgICB0aGlzLmNsb3NlRGlhbG9nKCk7XHJcblxyXG4gICAgICAgIC8vIERvbid0IGhhbmRsZSBwaHJhc2Ugb3IgcGhyYXNlc2V0cyAtIG9ubHkgdmlhIHRoZWlyIGJ1dHRvbnNcclxuICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZScgfHwgdHlwZSA9PT0gJ3BocmFzZXNldCcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSWYgY2xpY2tpbmcgdGhlIGVsZW1lbnQgYWxyZWFkeSBiZWluZyBlZGl0ZWQsIGRvbid0IHJlb3BlblxyXG4gICAgICAgIGlmICh0YXJnZXQgPT09IHByZXZUYXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHRvZ2dsZSAgICAgICA9IHRhcmdldC5jbG9zZXN0KCcudG9nZ2xlJykgICAgICAgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IGNob29zZVBocmFzZSA9IHRhcmdldC5jbG9zZXN0KCcuY2hvb3NlUGhyYXNlJykgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBjb2xsYXBzaWJsZSBlbGVtZW50c1xyXG4gICAgICAgIGlmICh0b2dnbGUpXHJcbiAgICAgICAgICAgIHRoaXMudG9nZ2xlQ29sbGFwc2lhYmxlKHRvZ2dsZSk7XHJcblxyXG4gICAgICAgIC8vIFNwZWNpYWwgY2FzZSBmb3IgcGhyYXNlc2V0IGNob29zZXJcclxuICAgICAgICBlbHNlIGlmIChjaG9vc2VQaHJhc2UpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBUT0RPOiBBc3NlcnQgaGVyZT9cclxuICAgICAgICAgICAgdGFyZ2V0ID0gY2hvb3NlUGhyYXNlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICBwaWNrZXIgPSBSQUcudmlld3MuZ2V0UGlja2VyKHRhcmdldC5kYXRhc2V0Wyd0eXBlJ10hKTtcclxuICAgICAgICAgICAgdGhpcy5vcGVuUGlja2VyKHRhcmdldCwgcGlja2VyKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYW5kIG9wZW4gcGlja2VyIGZvciB0aGUgdGFyZ2V0IGVsZW1lbnRcclxuICAgICAgICBlbHNlIGlmICh0eXBlICYmIHBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5vcGVuUGlja2VyKHRhcmdldCwgcGlja2VyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmUtbGF5b3V0IHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgb24gcmVzaXplICovXHJcbiAgICBwcml2YXRlIG9uUmVzaXplKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlLWxheW91dCB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIG9uIHNjcm9sbCAqL1xyXG4gICAgcHJpdmF0ZSBvblNjcm9sbChfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gV29ya2Fyb3VuZCBmb3IgbGF5b3V0IGJlaGF2aW5nIHdlaXJkIHdoZW4gaU9TIGtleWJvYXJkIGlzIG9wZW5cclxuICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIuaGFzRm9jdXMoKSlcclxuICAgICAgICAgICAgRE9NLmJsdXJBY3RpdmUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmxpcHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIGFuZCBwcm9wYWdhdGVzIHRoZSBuZXcgc3RhdGUgdG8gb3RoZXJcclxuICAgICAqIGNvbGxhcHNpYmxlcyBvZiB0aGUgc2FtZSByZWZlcmVuY2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBDb2xsYXBzaWJsZSBlbGVtZW50IGJlaW5nIHRvZ2dsZWRcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB0b2dnbGVDb2xsYXBzaWFibGUodGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgICAgPSB0YXJnZXQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICAgPSBET00ucmVxdWlyZURhdGEocGFyZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IHR5cGUgICAgICAgPSBET00ucmVxdWlyZURhdGEocGFyZW50LCAndHlwZScpO1xyXG4gICAgICAgIGxldCBjb2xsYXBhc2VkID0gcGFyZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcblxyXG4gICAgICAgIC8vIFByb3BhZ2F0ZSBuZXcgY29sbGFwc2Ugc3RhdGUgdG8gYWxsIGNvbGxhcHNpYmxlcyBvZiB0aGUgc2FtZSByZWZcclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICAgICBgc3BhbltkYXRhLXR5cGU9JHt0eXBlfV1bZGF0YS1yZWY9JHtyZWZ9XVtkYXRhLWNoYW5jZV1gXHJcbiAgICAgICAgKS5mb3JFYWNoKHNwYW4gPT5cclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2libGVzLnNldChzcGFuIGFzIEhUTUxFbGVtZW50LCAhY29sbGFwYXNlZCk7XHJcbiAgICAgICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS51cGRhdGUoc3BhbiBhcyBIVE1MRWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICAvLyBEb24ndCBtb3ZlIHRoaXMgdG8gQ29sbGFwc2libGVzLnNldCwgYXMgc3RhdGUgc2F2ZS9sb2FkIGlzIGhhbmRsZWRcclxuICAgICAgICAgICAgICAgIC8vIG91dHNpZGUgaW4gYm90aCB1c2FnZXMgb2Ygc2V0Q29sbGFwc2libGUuXHJcbiAgICAgICAgICAgICAgICBSQUcuc3RhdGUuc2V0Q29sbGFwc2VkKHJlZiwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW5zIGEgcGlja2VyIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVkaXRvciBlbGVtZW50IHRvIG9wZW4gdGhlIHBpY2tlciBmb3JcclxuICAgICAqIEBwYXJhbSBwaWNrZXIgUGlja2VyIHRvIG9wZW5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvcGVuUGlja2VyKHRhcmdldDogSFRNTEVsZW1lbnQsIHBpY2tlcjogUGlja2VyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0YXJnZXQuc2V0QXR0cmlidXRlKCdlZGl0aW5nJywgJ3RydWUnKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gcGlja2VyO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHRhcmdldDtcclxuICAgICAgICBwaWNrZXIub3Blbih0YXJnZXQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzY3JvbGxpbmcgbWFycXVlZSAqL1xyXG5jbGFzcyBNYXJxdWVlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1hcnF1ZWUncyBET00gZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzcGFuIGVsZW1lbnQgaW4gdGhlIG1hcnF1ZWUsIHdoZXJlIHRoZSB0ZXh0IGlzIHNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21TcGFuIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSBJRCBmb3IgdGhlIHNjcm9sbGluZyBhbmltYXRpb24gdGltZXIgKi9cclxuICAgIHByaXZhdGUgdGltZXIgIDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBDdXJyZW50IG9mZnNldCAoaW4gcGl4ZWxzKSBvZiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuICAgIHByaXZhdGUgb2Zmc2V0IDogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICA9IERPTS5yZXF1aXJlKCcjbWFycXVlZScpO1xyXG4gICAgICAgIHRoaXMuZG9tU3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQodGhpcy5kb21TcGFuKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgbWVzc2FnZSBvbiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUsIGFuZCBzdGFydHMgYW5pbWF0aW5nIGl0ICovXHJcbiAgICBwdWJsaWMgc2V0KG1zZzogc3RyaW5nLCBhbmltYXRlOiBib29sZWFuID0gdHJ1ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNwYW4udGV4dENvbnRlbnQgICAgID0gbXNnO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuXHJcbiAgICAgICAgaWYgKCFhbmltYXRlKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEkgdHJpZWQgdG8gdXNlIENTUyBhbmltYXRpb24gZm9yIHRoaXMsIGJ1dCBjb3VsZG4ndCBmaWd1cmUgb3V0IGhvdyBmb3IgYVxyXG4gICAgICAgIC8vIGR5bmFtaWNhbGx5IHNpemVkIGVsZW1lbnQgbGlrZSB0aGUgc3Bhbi5cclxuICAgICAgICB0aGlzLm9mZnNldCA9IHRoaXMuZG9tLmNsaWVudFdpZHRoO1xyXG4gICAgICAgIGxldCBsaW1pdCAgID0gLXRoaXMuZG9tU3Bhbi5jbGllbnRXaWR0aCAtIDEwMDtcclxuICAgICAgICBsZXQgYW5pbSAgICA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm9mZnNldCAgICAgICAgICAgICAgICAgIC09IDY7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gID0gYHRyYW5zbGF0ZVgoJHt0aGlzLm9mZnNldH1weClgO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub2Zmc2V0IDwgbGltaXQpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW0pO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTd2FwIGluIG5ldyB0ZXh0IHdpdGhvdXQgcmVzdGFydGluZyB0aGUgc2Nyb2xsLiBXaGlsZSB0aGUgbWFycXVlZSBpc1xyXG4gICAgICogYWxyZWFkeSBzY3JvbGxpbmcsIHRoZSBuZXcgdGV4dCB0YWtlcyBvdmVyIGluIHBsYWNlICh1c2VkIGZvciB3YWl0XHJcbiAgICAgKiBjb3VudGRvd24gdGlja3MsIHNvIHRoZXkgZG9uJ3QganVtcCBiYWNrIHRvIHRoZSByaWdodCBlZGdlIGV2ZXJ5XHJcbiAgICAgKiBzZWNvbmQpOyBvdGhlcndpc2UgaXQgYmVoYXZlcyBsaWtlIGEgZnJlc2ggc2V0KCkuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTb2Z0KG1zZzogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy50aW1lciAhPT0gMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi50ZXh0Q29udGVudCA9IG1zZztcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5zZXQobXNnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgdGhlIGN1cnJlbnQgbWFycXVlZSBhbmltYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLzxyZWZlcmVuY2UgcGF0aD1cInZpZXdCYXNlLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuY2xhc3MgU2V0dGluZ3MgZXh0ZW5kcyBWaWV3QmFzZVxyXG57XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blJlc2V0ICAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuUmVzZXRTZXR0aW5ncycpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5TYXZlICAgICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTEJ1dHRvbkVsZW1lbnQ+ICgnI2J0blNhdmVTZXR0aW5ncycpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBjaGtVc2VWb3ggICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI2Noa1VzZVZveCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBoaW50VXNlVm94ICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTEVsZW1lbnQ+ICAgICAgICgnI2hpbnRVc2VWb3gnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsVm94Vm9pY2UgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxWb3hWb2ljZScpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dFZveFBhdGggICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI2lucHV0Vm94UGF0aCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hSZXZlcmIgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveFJldmVyYicpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hDaGltZSAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveENoaW1lJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFNwZWVjaFZvaWNlICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsU3BlZWNoQ2hvaWNlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJhbmdlU3BlZWNoVm9sICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjcmFuZ2VTcGVlY2hWb2wnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hQaXRjaCA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFBpdGNoJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJhbmdlU3BlZWNoUmF0ZSAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjcmFuZ2VTcGVlY2hSYXRlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blNwZWVjaFRlc3QgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuU3BlZWNoVGVzdCcpO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHRpbWVyIGZvciB0aGUgXCJSZXNldFwiIGJ1dHRvbiBjb25maXJtYXRpb24gc3RlcCAqL1xyXG4gICAgcHJpdmF0ZSByZXNldFRpbWVvdXQ/IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJyNzZXR0aW5nc1NjcmVlbicpO1xyXG4gICAgICAgIC8vIFRPRE86IENoZWNrIGlmIFZPWCBpcyBhdmFpbGFibGUsIGRpc2FibGUgaWYgbm90XHJcblxyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQub25jbGljayAgICAgID0gdGhpcy5oYW5kbGVSZXNldC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5vbmNsaWNrICAgICAgID0gdGhpcy5oYW5kbGVTYXZlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5jaGtVc2VWb3gub25jaGFuZ2UgICAgPSB0aGlzLmxheW91dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuc2VsVm94Vm9pY2Uub25jaGFuZ2UgID0gdGhpcy5sYXlvdXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3Qub25jbGljayA9IHRoaXMuaGFuZGxlVm9pY2VUZXN0LmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIFBvcHVsYXRlIGxpc3Qgb2YgaW1wdWxzZSByZXNwb25zZSBmaWxlc1xyXG4gICAgICAgIERPTS5wb3B1bGF0ZSh0aGlzLnNlbFZveFJldmVyYiwgVm94RW5naW5lLlJFVkVSQlMsIFJBRy5jb25maWcudm94UmV2ZXJiKTtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGUgdGhlIGxlZ2FsICYgYWNrbm93bGVkZ2VtZW50cyBibG9ja1xyXG4gICAgICAgIExpbmtkb3duLmxvYWRJbnRvKCdBQk9VVC5tZCcsICcjYWJvdXRCbG9jaycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBPcGVucyB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgb3BlbigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRoZSB2b2ljZSBsaXN0IGhhcyB0byBiZSBwb3B1bGF0ZWQgZWFjaCBvcGVuLCBpbiBjYXNlIGl0IGNoYW5nZXNcclxuICAgICAgICB0aGlzLnBvcHVsYXRlVm9pY2VMaXN0KCk7XHJcblxyXG4gICAgICAgIGlmICghUkFHLnNwZWVjaC52b3hBdmFpbGFibGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBUT0RPIDogTG9jYWxpemVcclxuICAgICAgICAgICAgdGhpcy5jaGtVc2VWb3guY2hlY2tlZCAgICA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmNoa1VzZVZveC5kaXNhYmxlZCAgID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5oaW50VXNlVm94LmlubmVySFRNTCA9ICc8c3Ryb25nPlZPWCBlbmdpbmU8L3N0cm9uZz4gaXMgdW5hdmFpbGFibGUuJyArXHJcbiAgICAgICAgICAgICAgICAnIFlvdXIgYnJvd3NlciBvciBkZXZpY2UgbWF5IG5vdCBiZSBzdXBwb3J0ZWQ7IHBsZWFzZSBjaGVjayB0aGUgY29uc29sZScgK1xyXG4gICAgICAgICAgICAgICAgJyBmb3IgbW9yZSBpbmZvcm1hdGlvbi4nO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuY2hrVXNlVm94LmNoZWNrZWQgPSBSQUcuY29uZmlnLnZveEVuYWJsZWQ7XHJcblxyXG4gICAgICAgIHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hQYXRoO1xyXG4gICAgICAgIHRoaXMuaW5wdXRWb3hQYXRoLnZhbHVlICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoO1xyXG4gICAgICAgIHRoaXMuc2VsVm94UmV2ZXJiLnZhbHVlICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hSZXZlcmI7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hDaGltZS52YWx1ZSAgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveENoaW1lO1xyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2UudmFsdWUgICAgICAgICAgID0gUkFHLmNvbmZpZy5zcGVlY2hWb2ljZTtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlQXNOdW1iZXIgICA9IFJBRy5jb25maWcuc3BlZWNoVm9sO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyID0gUkFHLmNvbmZpZy5zcGVlY2hQaXRjaDtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZUFzTnVtYmVyICA9IFJBRy5jb25maWcuc3BlZWNoUmF0ZTtcclxuXHJcbiAgICAgICAgdGhpcy5sYXlvdXQoKTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgIC8vIFJldHVybiBmb2N1cyB0byB0aGUgcGFuZWwgYnV0dG9uIHRoYXQgb3BlbmVkIHVzLCBpZiB3ZSB3ZXJlXHJcbiAgICAgICAgLy8gb3BlbmVkIGZyb20gdGhlIGRhc2hib2FyZCBwYW5lbDsgdGhlIGVkaXRvciB2aWV3IGhhcyBubyBvcGVuZXIuXHJcbiAgICAgICAgbGV0IG9wZW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkYXNoU2V0dGluZ3MnKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XHJcbiAgICAgICAgaWYgKG9wZW5lcilcclxuICAgICAgICAgICAgb3BlbmVyLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGN1bGF0ZXMgZm9ybSBsYXlvdXQgYW5kIGNvbnRyb2wgdmlzaWJpbGl0eSBiYXNlZCBvbiBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBsYXlvdXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgdm94RW5hYmxlZCA9IHRoaXMuY2hrVXNlVm94LmNoZWNrZWQ7XHJcbiAgICAgICAgbGV0IHZveEN1c3RvbSAgPSAodGhpcy5zZWxWb3hWb2ljZS52YWx1ZSA9PT0gJycpO1xyXG5cclxuICAgICAgICBET00udG9nZ2xlSGlkZGVuQWxsKFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxTcGVlY2hWb2ljZSwgICAhdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnJhbmdlU3BlZWNoUGl0Y2gsICF2b3hFbmFibGVkXSxcclxuICAgICAgICAgICAgW3RoaXMuc2VsVm94Vm9pY2UsICAgICAgIHZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5pbnB1dFZveFBhdGgsICAgICAgdm94RW5hYmxlZCAmJiB2b3hDdXN0b21dLFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxWb3hSZXZlcmIsICAgICAgdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnNlbFZveENoaW1lLCAgICAgICB2b3hFbmFibGVkXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbmQgcG9wdWxhdGVzIHRoZSB2b2ljZSBsaXN0ICovXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlVm9pY2VMaXN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgbGV0IHZvaWNlcyA9IFJBRy5zcGVlY2guYnJvd3NlclZvaWNlcztcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGxpc3RcclxuICAgICAgICBpZiAodm9pY2VzID09PSB7fSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBvcHRpb24gICAgICA9IERPTS5hZGRPcHRpb24odGhpcy5zZWxTcGVlY2hWb2ljZSwgTC5TVF9TUEVFQ0hfRU1QVFkpO1xyXG4gICAgICAgICAgICBvcHRpb24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvU3BlZWNoU3ludGhlc2lzXHJcbiAgICAgICAgZWxzZSBmb3IgKGxldCBuYW1lIGluIHZvaWNlcylcclxuICAgICAgICAgICAgRE9NLmFkZE9wdGlvbih0aGlzLnNlbFNwZWVjaFZvaWNlLCBgJHtuYW1lfSAoJHt2b2ljZXNbbmFtZV0ubGFuZ30pYCwgbmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHJlc2V0IGJ1dHRvbiwgd2l0aCBhIGNvbmZpcm0gc3RlcCB0aGF0IGNhbmNlbHMgYWZ0ZXIgMTUgc2Vjb25kcyAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVSZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5yZXNldFRpbWVvdXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHNldFRpbWVvdXQodGhpcy5jYW5jZWxSZXNldC5iaW5kKHRoaXMpLCAxNTAwMCk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuUmVzZXQuaW5uZXJUZXh0ID0gTC5TVF9SRVNFVF9DT05GSVJNO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfQ09ORklSTV9UO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuY29uZmlnLnJlc2V0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIHRoaXMub3BlbigpO1xyXG4gICAgICAgIGFsZXJ0KEwuU1RfUkVTRVRfRE9ORSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbmNlbCB0aGUgcmVzZXQgdGltZW91dCBhbmQgcmVzdG9yZSB0aGUgcmVzZXQgYnV0dG9uIHRvIG5vcm1hbCAqL1xyXG4gICAgcHJpdmF0ZSBjYW5jZWxSZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5yZXNldFRpbWVvdXQpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQuaW5uZXJUZXh0ID0gTC5TVF9SRVNFVDtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfVDtcclxuICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2F2ZSBidXR0b24sIHNhdmluZyBjb25maWcgdG8gc3RvcmFnZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVTYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hFbmFibGVkICAgID0gdGhpcy5jaGtVc2VWb3guY2hlY2tlZDtcclxuICAgICAgICBSQUcuY29uZmlnLnZveFBhdGggICAgICAgPSB0aGlzLnNlbFZveFZvaWNlLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94Q3VzdG9tUGF0aCA9IHRoaXMuaW5wdXRWb3hQYXRoLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94UmV2ZXJiICAgICA9IHRoaXMuc2VsVm94UmV2ZXJiLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94Q2hpbWUgICAgICA9IHRoaXMuc2VsVm94Q2hpbWUudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSAgID0gdGhpcy5zZWxTcGVlY2hWb2ljZS52YWx1ZTtcclxuICAgICAgICAvLyBwYXJzZUZsb2F0IGluc3RlYWQgb2YgdmFsdWVBc051bWJlcjsgc2VlIEFyY2hpdGVjdHVyZS5tZFxyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoVm9sICAgICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hQaXRjaCAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSAgICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFJhdGUudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc2F2ZSgpO1xyXG4gICAgICAgIHRoaXMuY2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc3BlZWNoIHRlc3QgYnV0dG9uLCBzcGVha2luZyBhIHRlc3QgcGhyYXNlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVZvaWNlVGVzdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0LmRpc2FibGVkID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gSGFzIHRvIGV4ZWN1dGUgb24gYSBkZWxheSwgYXMgc3BlZWNoIGNhbmNlbCBpcyB1bnJlbGlhYmxlIHdpdGhvdXQgaXRcclxuICAgICAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0LmRpc2FibGVkID0gZmFsc2U7XHJcblxyXG4gICAgICAgICAgICBsZXQgcGhyYXNlICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lckhUTUwgPSAnPHBocmFzZSByZWY9XCJzYW1wbGVcIi8+JztcclxuXHJcbiAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MocGhyYXNlKTtcclxuXHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3BlYWsoXHJcbiAgICAgICAgICAgICAgICBwaHJhc2UuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHVzZVZveCAgICA6IHRoaXMuY2hrVXNlVm94LmNoZWNrZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94UGF0aCAgIDogdGhpcy5zZWxWb3hWb2ljZS52YWx1ZSB8fCB0aGlzLmlucHV0Vm94UGF0aC52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICB2b3hSZXZlcmIgOiB0aGlzLnNlbFZveFJldmVyYi52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICB2b3hDaGltZSAgOiB0aGlzLnNlbFZveENoaW1lLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHZvaWNlTmFtZSA6IHRoaXMuc2VsU3BlZWNoVm9pY2UudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm9sdW1lICAgIDogdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHBpdGNoICAgICA6IHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHJhdGUgICAgICA6IHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXJcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9LCAyMDApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xuXG4vKipcbiAqIENvbnRyb2xsZXIgZm9yIHRoZSB0b3AgdG9vbGJhciBvZiB0aGUgc3RlcCBlZGl0b3IgdmlldzogUGxheSwgU3RvcCxcbiAqIFNodWZmbGUgKHJlZ2VuZXJhdGUpLCBVcGRhdGUgU3RlcCwgYW5kIENsb3NlLlxuICpcbiAqIEJvdGggcGFnZXMgKGluZGV4Lmh0bWwgYW5kIHNjcmVlbi5odG1sKSBjYXJyeSB0aGUgaWRlbnRpY2FsIHRvb2xiYXIuXG4gKiBUaGUgZGFzaGJvYXJkIHJvbGUgcmV2ZWFscyBpdCBvbmx5IHdoaWxlIGVkaXRpbmcgYSBzdGVwOyB0aGUgc2NyZWVuXG4gKiByb2xlIGhpZGVzIGl0IGF0IGJvb3QsIHNvIGl0cyBidXR0b25zIGFyZSBuZXZlciB1c2VkIHRoZXJlLlxuICovXG5jbGFzcyBUb29sYmFyXG57XG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gICAgICAgICA6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUGxheSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blN0b3AgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5HZW5lcmF0ZSA6IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuVXBkYXRlU3RlcCA6IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQ2xvc2UgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcblxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXG4gICAge1xuICAgICAgICB0aGlzLmRvbSAgICAgICAgICAgPSBET00ucmVxdWlyZSgnI3Rvb2xiYXInKTtcbiAgICAgICAgdGhpcy5idG5QbGF5ICAgICAgID0gRE9NLnJlcXVpcmUoJyNidG5QbGF5Jyk7XG4gICAgICAgIHRoaXMuYnRuU3RvcCAgICAgICA9IERPTS5yZXF1aXJlKCcjYnRuU3RvcCcpO1xuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlICAgPSBET00ucmVxdWlyZSgnI2J0blNodWZmbGUnKTtcbiAgICAgICAgdGhpcy5idG5VcGRhdGVTdGVwID0gRE9NLnJlcXVpcmUoJyNidG5VcGRhdGVTdGVwJyk7XG4gICAgICAgIHRoaXMuYnRuQ2xvc2UgICAgICAgPSBET00ucmVxdWlyZSgnI2J0bkNsb3NlJyk7XG5cbiAgICAgICAgdGhpcy5idG5QbGF5Lm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVQbGF5LmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnRuU3RvcC5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlU3RvcC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLm9uY2xpY2sgPSB0aGlzLmhhbmRsZUdlbmVyYXRlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnRuVXBkYXRlU3RlcC5vbmNsaWNrID0gdGhpcy5oYW5kbGVVcGRhdGVTdGVwLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnRuQ2xvc2Uub25jbGljayAgICA9IHRoaXMuaGFuZGxlQ2xvc2UuYmluZCh0aGlzKTtcblxuICAgICAgICBpZiAoIVJBRy5jb25maWcuY2xpY2tlZEdlbmVyYXRlKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5hZGQoJ3Rocm9iJyk7XG4gICAgICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmZvY3VzKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5idG5QbGF5LmZvY3VzKCk7XG4gICAgfVxuXG4gICAgLyoqIFBsYXlzIHRoZSBjdXJyZW50IGFubm91bmNlbWVudCB0aHJvdWdoIHRoZSBzcGVlY2ggZW5naW5lICovXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5KCkgOiB2b2lkXG4gICAge1xuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcbiAgICAgICAgdGhpcy5idG5QbGF5LmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQodGhpcy5oYW5kbGVQbGF5Mi5iaW5kKHRoaXMpLCAyMDApO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlUGxheTIoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBoYXNTcG9rZW4gICA9IGZhbHNlO1xuICAgICAgICBsZXQgc3BlZWNoVGV4dCAgPSBSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKTtcbiAgICAgICAgdGhpcy5idG5QbGF5LmhpZGRlbiA9IHRydWU7XG4gICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmJ0blN0b3AuaGlkZGVuID0gZmFsc2U7XG5cbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCdMb2FkaW5nIFZPWC4uLicsIGZhbHNlKTtcblxuICAgICAgICBsZXQgdGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xuICAgICAgICB9LCAxMCAqIDEwMDApO1xuXG4gICAgICAgIFJBRy5zcGVlY2gub25zcGVhayA9ICgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChzcGVlY2hUZXh0KTtcbiAgICAgICAgICAgIGhhc1Nwb2tlbiAgICAgICAgICA9IHRydWU7XG4gICAgICAgICAgICBSQUcuc3BlZWNoLm9uc3BlYWsgPSB1bmRlZmluZWQ7XG4gICAgICAgIH07XG5cbiAgICAgICAgUkFHLnNwZWVjaC5vbnN0b3AgPSAoKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZVN0b3AoKTtcbiAgICAgICAgICAgIGlmICghaGFzU3Bva2VuICYmIFJBRy5jb25maWcudm94RW5hYmxlZClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBSQUcuY29uZmlnLnZveEVuYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBhbGVydCgnSXQgYXBwZWFycyB0aGF0IHRoZSBWT1ggZW5naW5lIHdhcyB1bmFibGUgdG8gc2F5IGFueXRoaW5nLiBUaGUgVk9YIGVuZ2luZSBoYXMgYmVlbiBkaXNhYmxlZCBhbmQgbmF0aXZlIHRleHQtdG8tc3BlZWNoIHdpbGwgYmUgdXNlZCBvbiBuZXh0IHBsYXkuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICghaGFzU3Bva2VuKVxuICAgICAgICAgICAgICAgIGFsZXJ0KCdJdCBhcHBlYXJzIHRoYXQgdGhlIGJyb3dzZXIgd2FzIHVuYWJsZSB0byBzYXkgYW55dGhpbmcuIFBsZWFzZSBjaGVjayB0aGUgY29uc29sZS4nKTtcbiAgICAgICAgICAgIGlmICghaGFzU3Bva2VuKVxuICAgICAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChzcGVlY2hUZXh0KTtcbiAgICAgICAgfTtcblxuICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKFJBRy52aWV3cy5lZGl0b3IuZ2V0UGhyYXNlKCkpO1xuICAgICAgICB0aGlzLmJ0blN0b3AuZm9jdXMoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZVN0b3AoZXY/OiBFdmVudCkgOiB2b2lkXG4gICAge1xuICAgICAgICBSQUcuc3BlZWNoLm9uc3BlYWsgID0gdW5kZWZpbmVkO1xuICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCAgID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLmJ0blBsYXkuaGlkZGVuID0gZmFsc2U7XG4gICAgICAgIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLmJ0blN0b3ApXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcbiAgICAgICAgdGhpcy5idG5TdG9wLmhpZGRlbiA9IHRydWU7XG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xuICAgICAgICBpZiAoZXYpXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoUkFHLnZpZXdzLmVkaXRvci5nZXRUZXh0KCksIGZhbHNlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZUdlbmVyYXRlKCkgOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5yZW1vdmUoJ3Rocm9iJyk7XG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xuICAgICAgICBSQUcuY29uZmlnLmNsaWNrZWRHZW5lcmF0ZSA9IHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV3JpdGVzIHRoZSBjdXJyZW50IGFubm91bmNlbWVudCBiYWNrIGludG8gdGhlIHNlbGVjdGVkIHNjZW5hcmlvIHN0ZXBcbiAgICAgKiAodGhlIG9uZSBvcGVuZWQgZm9yIGVkaXRpbmcgZnJvbSB0aGUgZGFzaGJvYXJkKSwgdGhlbiBjbG9zZXMgdGhlXG4gICAgICogZWRpdG9yIHZpZXcgdG8gcmV0dXJuIHRvIHRoZSBzY2VuYXJpbyBkYXNoYm9hcmQuXG4gICAgICovXG4gICAgcHJpdmF0ZSBoYW5kbGVVcGRhdGVTdGVwKCkgOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgaWQgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgncmFnLmN1cnJlbnRTY2VuYXJpb0lkJyk7XG4gICAgICAgIGxldCBpZHhTdHIgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgncmFnLnNlbGVjdGVkU3RlcEluZGV4Jyk7XG4gICAgICAgIGlmICghaWQgfHwgaWR4U3RyID09PSBudWxsKSB7IGFsZXJ0KCdObyBzY2VuYXJpby9zdGVwIHNlbGVjdGVkLiBPcGVuIHRoZSBkYXNoYm9hcmQgYW5kIGNsaWNrIGEgc3RlcCBmaXJzdC4nKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KGlkeFN0cik7XG4gICAgICAgIGxldCByYXcgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgncmFnLnNjZW5hcmlvcycpO1xuICAgICAgICBpZiAoIXJhdykgeyBhbGVydCgnTm8gc2NlbmFyaW9zIHNhdmVkIHlldC4nKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgbGV0IHNjZW5hcmlvcyA9IEpTT04ucGFyc2UocmF3KSBhcyBhbnlbXTtcbiAgICAgICAgbGV0IHNjID0gc2NlbmFyaW9zLmZpbmQoKHM6IGFueSkgPT4gcy5pZCA9PT0gaWQpO1xuICAgICAgICBpZiAoIXNjIHx8ICFzYy5zdGVwc1tpZHhdKSB7IGFsZXJ0KCdTdGVwIG5vdCBmb3VuZC4nKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgc2Muc3RlcHNbaWR4XS5zdGF0ZUpzb24gPSBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpO1xuICAgICAgICBzYy51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgncmFnLnNjZW5hcmlvcycsIEpTT04uc3RyaW5naWZ5KHNjZW5hcmlvcykpO1xuICAgICAgICBSQUcuZGFzaGJvYXJkLmNsb3NlRWRpdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsb3NlIHJlcXVlc3QgZnJvbSB0aGUg4pyVIGJ1dHRvbjogdGhlIGRhc2hib2FyZCBjbG9zZXMgc3RyYWlnaHQgYXdheVxuICAgICAqIGlmIHRoZSBzdGVwIGhhcyBubyB1bnNhdmVkIGNoYW5nZXMsIGFuZCBhc2tzIGZpcnN0IG90aGVyd2lzZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGhhbmRsZUNsb3NlKCkgOiB2b2lkXG4gICAge1xuICAgICAgICBSQUcuZGFzaGJvYXJkLnJlcXVlc3RDbG9zZSgpO1xuICAgIH1cbn1cbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIFVJIGVsZW1lbnRzIGFuZCB0aGVpciBsb2dpYyAqL1xyXG5jbGFzcyBWaWV3c1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHNjcmVlbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBtYWluICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIGRpc2NsYWltZXIgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGRpc2NsYWltZXIgOiBEaXNjbGFpbWVyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBlZGl0b3IgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGVkaXRvciAgICAgOiBFZGl0b3I7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIG1hcnF1ZWUgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG1hcnF1ZWUgICAgOiBNYXJxdWVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc2V0dGluZ3MgICA6IFNldHRpbmdzO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiB0b29sYmFyIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSB0b29sYmFyICAgIDogVG9vbGJhcjtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGFsbCB0aGUgcGlja2Vycywgb25lIGZvciBlYWNoIHR5cGUgb2YgWE1MIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcGlja2VycyAgICA6IERpY3Rpb25hcnk8UGlja2VyPjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMubWFpbiAgICAgICA9IERPTS5yZXF1aXJlKCcjbWFpblNjcmVlbicpO1xyXG4gICAgICAgIHRoaXMuZGlzY2xhaW1lciA9IG5ldyBEaXNjbGFpbWVyKCk7XHJcbiAgICAgICAgdGhpcy5lZGl0b3IgICAgID0gbmV3IEVkaXRvcigpO1xyXG4gICAgICAgIHRoaXMubWFycXVlZSAgICA9IG5ldyBNYXJxdWVlKCk7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncyAgID0gbmV3IFNldHRpbmdzKCk7XHJcbiAgICAgICAgdGhpcy50b29sYmFyICAgID0gbmV3IFRvb2xiYXIoKTtcclxuICAgICAgICB0aGlzLnBpY2tlcnMgICAgPSB7fTtcclxuXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgICBuZXcgQ29hY2hQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEV4Y3VzZVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgSW50ZWdlclBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgTmFtZWRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBocmFzZXNldFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgUGxhdGZvcm1QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFNlcnZpY2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25MaXN0UGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBUaW1lUGlja2VyKClcclxuICAgICAgICBdLmZvckVhY2gocGlja2VyID0+IHRoaXMucGlja2Vyc1twaWNrZXIueG1sVGFnXSA9IHBpY2tlcik7XHJcblxyXG4gICAgICAgIC8vIEdsb2JhbCBob3RrZXlzXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaU9TLXNwZWNpZmljIENTUyBmaXhlc1xyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnaW9zJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIHBpY2tlciB0aGF0IGhhbmRsZXMgYSBnaXZlbiB0YWcsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGdldFBpY2tlcih4bWxUYWc6IHN0cmluZykgOiBQaWNrZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waWNrZXJzW3htbFRhZ107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGUgRVNDOiBjbG9zZXMgYW4gb3BlbiBwaWNrZXIgb3IgdGhlIHNldHRpbmdzIHNjcmVlbi4gV2l0aCBub3RoaW5nXHJcbiAgICAgKiBlbHNlIG9wZW4sIGluIHRoZSBkYXNoYm9hcmQgcm9sZSBpdCBhc2tzIHRvIGxlYXZlIHRoZSBzdGVwIGVkaXRvciB2aWV3XHJcbiAgICAgKiDigJQgdGhlIGRhc2hib2FyZCBjb25maXJtcyBmaXJzdCBpZiB0aGVyZSBhcmUgdW5zYXZlZCBjaGFuZ2VzLiBPbmUgbGF5ZXJcclxuICAgICAqIHBlciBwcmVzcywgc28gZGlzbWlzc2luZyBhIHBpY2tlciBkb2VzIG5vdCBsZWF2ZSB0aGUgZWRpdG9yIHdpdGggaXQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGV2LmtleSAhPT0gJ0VzY2FwZScpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGxheWVyT3BlbiA9ICEhZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBpY2tlcjpub3QoW2hpZGRlbl0pJylcclxuICAgICAgICAgICAgfHwgIShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3NTY3JlZW4nKSBhcyBIVE1MRWxlbWVudCkuaGlkZGVuO1xyXG5cclxuICAgICAgICB0aGlzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuY2xvc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKCFsYXllck9wZW4gJiYgUkFHLmlzRGFzaGJvYXJkUm9sZSgpICYmIFJBRy5kYXNoYm9hcmQgJiYgUkFHLmRhc2hib2FyZC5lZGl0aW5nKVxyXG4gICAgICAgICAgICBSQUcuZGFzaGJvYXJkLnJlcXVlc3RDbG9zZSgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8gR2xvYmFsIG1ldGhvZHMgZm9yIGFzc2VydGluZyB0aGUgZXhpc3RlbmNlIG9mIHZhbHVlcy4gVG8ga2VlcCB0aGUgY2hhbmNlIG9mIGVycm9yc1xyXG4vLyB3aXRoaW4gYXNzZXJ0cyBsb3csIG5vIGxvY2FsaXphdGlvbiBpcyB1c2VkIGhlcmUuXHJcblxyXG4vKiogQXNzZXJ0cyB0aGF0IHRoZSBnaXZlbiB2YWx1ZSBleGlzdHM7IG5laXRoZXIgdW5kZWZpbmVkIG5vciBudWxsICovXHJcbmZ1bmN0aW9uIGFzc2VydDxUPih2YWx1ZTogVCkgOiBUXHJcbntcclxuICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKVxyXG4gICAgICAgIHRocm93IEFzc2VydEVycm9yKCdWYWx1ZSBkb2VzIG5vdCBleGlzdCcsIGFzc2VydCk7XHJcblxyXG4gICAgcmV0dXJuIHZhbHVlO1xyXG59XHJcblxyXG4vKiogQXNzZXJ0cyB0aGF0IHRoZSBnaXZlbiB2YWx1ZSBleGlzdHMgYW5kIGlzIGEgbnVtYmVyICovXHJcbmZ1bmN0aW9uIGFzc2VydE51bWJlcih2YWx1ZTogbnVtYmVyKSA6IHZvaWRcclxue1xyXG4gICAgaWYgKCB0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInIHx8IGlzTmFOKHZhbHVlKSApXHJcbiAgICAgICAgdGhyb3cgQXNzZXJ0RXJyb3IoJ1ZhbHVlIGlzIG5vdCBhIG51bWJlcicsIGFzc2VydE51bWJlcik7XHJcbn1cclxuXHJcbi8qKiBDcmVhdGVzIGFuIGFzc2VydGlvbiBlcnJvciB0aGF0IGJlZ2lucyB0aGUgc3RhY2sgYXQgdGhlIGFzc2VydCdzIGNhbGwgc2l0ZSAgKi9cclxuZnVuY3Rpb24gQXNzZXJ0RXJyb3IobWVzc2FnZTogYW55LCBjYWxsZXI6IEZ1bmN0aW9uKSA6IEVycm9yXHJcbntcclxuICAgIGxldCBlcnJvciA9IEVycm9yKGBBc3NlcnRpb24gZmFpbGVkOiAke21lc3NhZ2V9YCk7XHJcblxyXG4gICAgaWYgKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKVxyXG4gICAgICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKGVycm9yLCBjYWxsZXIpO1xyXG5cclxuICAgIHJldHVybiBlcnJvcjtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBjb2xsYXBzaWJsZSBlbGVtZW50cyAqL1xyXG5jbGFzcyBDb2xsYXBzaWJsZXNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNwYW4gVGhlIGVuY2Fwc3VsYXRpbmcgY29sbGFwc2libGUgZWxlbWVudFxyXG4gICAgICogQHBhcmFtIHN0YXRlIFRydWUgdG8gY29sbGFwc2UsIGZhbHNlIHRvIG9wZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzZXQoc3BhbjogSFRNTEVsZW1lbnQsIHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoc3RhdGUpIHNwYW4uc2V0QXR0cmlidXRlKCdjb2xsYXBzZWQnLCAnJyk7XHJcbiAgICAgICAgZWxzZSAgICAgICBzcGFuLnJlbW92ZUF0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3VnYXIgZm9yIGNob29zaW5nIHNlY29uZCB2YWx1ZSBpZiBmaXJzdCBpcyB1bmRlZmluZWQsIGluc3RlYWQgb2YgZmFsc3kgKi9cclxuZnVuY3Rpb24gZWl0aGVyPFQ+KHZhbHVlOiBUIHwgdW5kZWZpbmVkLCB2YWx1ZTI6IFQpIDogVFxyXG57XHJcbiAgICByZXR1cm4gKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpID8gdmFsdWUyIDogdmFsdWU7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggdGhlIERPTSAqL1xyXG5jbGFzcyBET01cclxue1xyXG4gICAgLyoqIFdoZXRoZXIgdGhlIHdpbmRvdyBpcyB0aGlubmVyIHRoYW4gYSBzcGVjaWZpYyBzaXplIChhbmQsIHRodXMsIGlzIFwibW9iaWxlXCIpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc01vYmlsZSgpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoIDw9IDUwMDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogV2hldGhlciBSQUcgYXBwZWFycyB0byBiZSBydW5uaW5nIG9uIGFuIGlPUyBkZXZpY2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzaU9TKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5wbGF0Zm9ybS5tYXRjaCgvaVBob25lfGlQb2R8aVBhZC9naSkgIT09IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCBvciByZXR1cm5zIHRoZSBnaXZlblxyXG4gICAgICogZGVmYXVsdCB2YWx1ZSBpZiB1bnNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gYXR0ciBOYW1lIG9mIHRoZSBhdHRyaWJ1dGUgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHBhcmFtIGRlZiBEZWZhdWx0IHZhbHVlIGlmIGF0dHJpYnV0ZSBpc24ndCBzZXRcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZSwgb3IgZGVmYXVsdCB2YWx1ZSBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldEF0dHIoZWxlbWVudDogSFRNTEVsZW1lbnQsIGF0dHI6IHN0cmluZywgZGVmOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpXHJcbiAgICAgICAgICAgID8gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cikhXHJcbiAgICAgICAgICAgIDogZGVmO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYW4gZWxlbWVudCBmcm9tIHRoZSBnaXZlbiBkb2N1bWVudCwgdGhyb3dpbmcgYW4gZXJyb3IgaWYgbm8gbWF0Y2ggaXMgZm91bmQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IENTUyBzZWxlY3RvciBxdWVyeSB0byB1c2VcclxuICAgICAqIEBwYXJhbSBwYXJlbnQgUGFyZW50IG9iamVjdCB0byBzZWFyY2g7IGRlZmF1bHRzIHRvIGRvY3VtZW50XHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZmlyc3QgZWxlbWVudCB0byBtYXRjaCB0aGUgZ2l2ZW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlPFQgZXh0ZW5kcyBIVE1MRWxlbWVudD5cclxuICAgICAgICAocXVlcnk6IHN0cmluZywgcGFyZW50OiBQYXJlbnROb2RlID0gd2luZG93LmRvY3VtZW50KSA6IFRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IocXVlcnkpIGFzIFQ7XHJcblxyXG4gICAgICAgIGlmICghcmVzdWx0KVxyXG4gICAgICAgICAgICB0aHJvdyBBc3NlcnRFcnJvcihMLkRPTV9NSVNTSU5HKHF1ZXJ5KSwgRE9NLnJlcXVpcmUpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBhdHRyaWJ1dGUgZnJvbSB0aGUgZ2l2ZW4gZWxlbWVudCwgdGhyb3dpbmcgYW4gZXJyb3JcclxuICAgICAqIGlmIHRoZSBhdHRyaWJ1dGUgaXMgbWlzc2luZy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gYXR0ciBOYW1lIG9mIHRoZSBhdHRyaWJ1dGUgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGF0dHJpYnV0ZSdzIHZhbHVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZUF0dHIoZWxlbWVudDogSFRNTEVsZW1lbnQsIGF0dHI6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoICFlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKSApXHJcbiAgICAgICAgICAgIHRocm93IEFzc2VydEVycm9yKEwuQVRUUl9NSVNTSU5HKGF0dHIpLCBET00ucmVxdWlyZUF0dHIpO1xyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cikhO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBrZXkgb2YgdGhlIGdpdmVuIGVsZW1lbnQncyBkYXRhc2V0LCB0aHJvd2luZyBhbiBlcnJvclxyXG4gICAgICogaWYgdGhlIHZhbHVlIGlzIG1pc3Npbmcgb3IgZW1wdHkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGRhdGEgb2ZcclxuICAgICAqIEBwYXJhbSBrZXkgS2V5IHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBkYXRhc2V0J3MgdmFsdWVcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlRGF0YShlbGVtZW50OiBIVE1MRWxlbWVudCwga2V5OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZhbHVlID0gZWxlbWVudC5kYXRhc2V0W2tleV07XHJcblxyXG4gICAgICAgIGlmICggU3RyaW5ncy5pc051bGxPckVtcHR5KHZhbHVlKSApXHJcbiAgICAgICAgICAgIHRocm93IEFzc2VydEVycm9yKEwuREFUQV9NSVNTSU5HKGtleSksIERPTS5yZXF1aXJlRGF0YSk7XHJcblxyXG4gICAgICAgIHJldHVybiB2YWx1ZSE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCbHVycyAodW5mb2N1c2VzKSB0aGUgY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50IElmIGdpdmVuLCBvbmx5IGJsdXJzIGlmIGFjdGl2ZSBpcyBkZXNjZW5kYW50XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYmx1ckFjdGl2ZShwYXJlbnQ6IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuYm9keSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGFjdGl2ZSA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggYWN0aXZlICYmIGFjdGl2ZS5ibHVyICYmIHBhcmVudC5jb250YWlucyhhY3RpdmUpIClcclxuICAgICAgICAgICAgYWN0aXZlLmJsdXIoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIERlZXAgY2xvbmVzIGFsbCB0aGUgY2hpbGRyZW4gb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGludG8gdGhlIHRhcmdldCBlbGVtZW50LlxyXG4gICAgICogVXNpbmcgaW5uZXJIVE1MIHdvdWxkIGJlIGVhc2llciwgaG93ZXZlciBpdCBoYW5kbGVzIHNlbGYtY2xvc2luZyB0YWdzIHBvb3JseS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc291cmNlIEVsZW1lbnQgd2hvc2UgY2hpbGRyZW4gdG8gY2xvbmVcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWxlbWVudCB0byBhcHBlbmQgdGhlIGNsb25lZCBjaGlsZHJlbiB0b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsb25lSW50byhzb3VyY2U6IEhUTUxFbGVtZW50LCB0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNvdXJjZS5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0YXJnZXQuYXBwZW5kQ2hpbGQoIHNvdXJjZS5jaGlsZE5vZGVzW2ldLmNsb25lTm9kZSh0cnVlKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3VnYXIgZm9yIGNyZWF0aW5nIGFuZCBhZGRpbmcgYW4gb3B0aW9uIGVsZW1lbnQgdG8gYSBzZWxlY3QgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFNlbGVjdCBsaXN0IGVsZW1lbnQgdG8gYWRkIHRoZSBvcHRpb24gdG9cclxuICAgICAqIEBwYXJhbSB0ZXh0IExhYmVsIGZvciB0aGUgb3B0aW9uXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVmFsdWUgZm9yIHRoZSBvcHRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhZGRPcHRpb24oc2VsZWN0OiBIVE1MU2VsZWN0RWxlbWVudCwgdGV4dDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nID0gJycpXHJcbiAgICAgICAgOiBIVE1MT3B0aW9uRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIGxldCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKSBhcyBIVE1MT3B0aW9uRWxlbWVudDtcclxuXHJcbiAgICAgICAgb3B0aW9uLnRleHQgID0gdGV4dDtcclxuICAgICAgICBvcHRpb24udmFsdWUgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgc2VsZWN0LmFkZChvcHRpb24pO1xyXG4gICAgICAgIHJldHVybiBvcHRpb247XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdWdhciBmb3IgcG9wdWxhdGluZyBhIHNlbGVjdCBlbGVtZW50IHdpdGggaXRlbXMgZnJvbSBhIGdpdmVuIG9iamVjdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbGlzdCBTZWxlY3QgZWxlbWVudCB0byBwb3B1bGF0ZVxyXG4gICAgICogQHBhcmFtIGl0ZW1zIEEgZGljdGlvbmFyeSB3aGVyZSBrZXlzIGFjdCBsaWtlIHZhbHVlcywgYW5kIHZhbHVlcyBsaWtlIGxhYmVsc1xyXG4gICAgICogQHBhcmFtIHNlbGVjdGVkIElmIG1hdGNoZXMgYSBkaWN0aW9uYXJ5IGtleSwgdGhhdCBrZXkgaXMgdGhlIHByZS1zZWxlY3RlZCBvcHRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwb3B1bGF0ZShsaXN0OiBIVE1MU2VsZWN0RWxlbWVudCwgaXRlbXM6IGFueSwgc2VsZWN0ZWQ/OiBhbnkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IHZhbHVlIGluIGl0ZW1zKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxhYmVsID0gaXRlbXNbdmFsdWVdO1xyXG4gICAgICAgICAgICBsZXQgb3B0ICAgPSBET00uYWRkT3B0aW9uKGxpc3QsIGxhYmVsLCB2YWx1ZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoc2VsZWN0ZWQgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSA9PT0gc2VsZWN0ZWQpXHJcbiAgICAgICAgICAgICAgICBvcHQuc2VsZWN0ZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHRleHQgY29udGVudCBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgZXhjbHVkaW5nIHRoZSB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlbi5cclxuICAgICAqIEJlIHdhcm5lZDsgdGhpcyBtZXRob2QgdXNlcyBSQUctc3BlY2lmaWMgY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xOTk4NjMyOFxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byByZWN1cnNpdmVseSBnZXQgdGV4dCBjb250ZW50IG9mXHJcbiAgICAgKiBAcmV0dXJucyBUZXh0IGNvbnRlbnQgb2YgZ2l2ZW4gZWxlbWVudCwgd2l0aG91dCB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldFZpc2libGVUZXh0KGVsZW1lbnQ6IEVsZW1lbnQpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgICAgICAoZWxlbWVudC5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpXHJcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50LnRleHRDb250ZW50IHx8ICcnO1xyXG4gICAgICAgIGVsc2UgaWYgKCBlbGVtZW50LnRhZ05hbWUgPT09ICdCVVRUT04nIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICAvLyBSZXR1cm4gYmxhbmsgKHNraXApIGlmIGNoaWxkIG9mIGEgY29sbGFwc2VkIGVsZW1lbnQuIFByZXZpb3VzbHksIHRoaXMgdXNlZFxyXG4gICAgICAgIC8vIGdldENvbXB1dGVkU3R5bGUsIGJ1dCB0aGF0IGRvZXNuJ3Qgd29yayBpZiB0aGUgZWxlbWVudCBpcyBwYXJ0IG9mIGFuIG9ycGhhbmVkXHJcbiAgICAgICAgLy8gcGhyYXNlIChhcyBoYXBwZW5zIHdpdGggdGhlIHBocmFzZXNldCBwaWNrZXIpLlxyXG4gICAgICAgIGxldCBwYXJlbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggcGFyZW50ICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICBsZXQgdGV4dCA9ICcnO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0ZXh0ICs9IERPTS5nZXRWaXNpYmxlVGV4dChlbGVtZW50LmNoaWxkTm9kZXNbaV0gYXMgRWxlbWVudCk7XHJcblxyXG4gICAgICAgIHJldHVybiB0ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBnaXZlbiBlbGVtZW50LCBleGNsdWRpbmcgdGhlIHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuLFxyXG4gICAgICogYW5kIGV4Y2VzcyB3aGl0ZXNwYWNlIGFzIGEgcmVzdWx0IG9mIGNvbnZlcnRpbmcgZnJvbSBIVE1ML1hNTC5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xOTk4NjMyOFxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byByZWN1cnNpdmVseSBnZXQgdGV4dCBjb250ZW50IG9mXHJcbiAgICAgKiBAcmV0dXJucyBDbGVhbmVkIHRleHQgb2YgZ2l2ZW4gZWxlbWVudCwgd2l0aG91dCB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldENsZWFuZWRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBTdHJpbmdzLmNsZWFuKCBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNjYW5zIGZvciB0aGUgbmV4dCBmb2N1c2FibGUgc2libGluZyBmcm9tIGEgZ2l2ZW4gZWxlbWVudCwgc2tpcHBpbmcgaGlkZGVuIG9yXHJcbiAgICAgKiB1bmZvY3VzYWJsZSBlbGVtZW50cy4gSWYgdGhlIGVuZCBvZiB0aGUgY29udGFpbmVyIGlzIGhpdCwgdGhlIHNjYW4gd3JhcHMgYXJvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBmcm9tIEVsZW1lbnQgdG8gc3RhcnQgc2Nhbm5pbmcgZnJvbVxyXG4gICAgICogQHBhcmFtIGRpciBEaXJlY3Rpb247IC0xIGZvciBsZWZ0IChwcmV2aW91cyksIDEgZm9yIHJpZ2h0IChuZXh0KVxyXG4gICAgICogQHJldHVybnMgVGhlIG5leHQgYXZhaWxhYmxlIHNpYmxpbmcsIG9yIG51bGwgaWYgbm9uZSBmb3VuZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZyb206IEhUTUxFbGVtZW50LCBkaXI6IG51bWJlcilcclxuICAgICAgICA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGlmIChkaXIgPT09IDApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9ESVJFQ1RJT04oZGlyKSApO1xyXG5cclxuICAgICAgICBsZXQgY3VycmVudCA9IGZyb207XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmcm9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICghcGFyZW50KVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRydWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBQcm9jZWVkIHRvIG5leHQgZWxlbWVudCwgb3Igd3JhcCBhcm91bmQgaWYgaGl0IHRoZSBlbmQgb2YgcGFyZW50XHJcbiAgICAgICAgICAgIGlmICAgICAgKGRpciA8IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgcGFyZW50Lmxhc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA+IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBjb21lIGJhY2sgdG8gdGhlIHN0YXJ0aW5nIGVsZW1lbnQsIG5vdGhpbmcgd2FzIGZvdW5kXHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50ID09PSBmcm9tKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB0aGlzIGVsZW1lbnQgaXNuJ3QgaGlkZGVuIGFuZCBpcyBmb2N1c2FibGUsIHJldHVybiBpdCFcclxuICAgICAgICAgICAgaWYgKCAhY3VycmVudC5oaWRkZW4gKVxyXG4gICAgICAgICAgICBpZiAoIGN1cnJlbnQuaGFzQXR0cmlidXRlKCd0YWJpbmRleCcpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiBjdXJyZW50O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGluZGV4IG9mIGEgY2hpbGQgZWxlbWVudCwgcmVsZXZhbnQgdG8gaXRzIHBhcmVudC5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS85MTMyNTc1LzMzNTQ5MjBcclxuICAgICAqIEBwYXJhbSBjaGlsZCBDaGlsZCBlbGVtZW50IHRvIGdldCB0aGUgaW5kZXggb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbmRleE9mKGNoaWxkOiBIVE1MRWxlbWVudCkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gY2hpbGQucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgcmV0dXJuIHBhcmVudFxyXG4gICAgICAgICAgICA/IEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwocGFyZW50LmNoaWxkcmVuLCBjaGlsZClcclxuICAgICAgICAgICAgOiAtMTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGluZGV4IG9mIGEgY2hpbGQgbm9kZSwgcmVsZXZhbnQgdG8gaXRzIHBhcmVudC4gVXNlZCBmb3IgdGV4dCBub2Rlcy5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS85MTMyNTc1LzMzNTQ5MjBcclxuICAgICAqIEBwYXJhbSBjaGlsZCBDaGlsZCBub2RlIHRvIGdldCB0aGUgaW5kZXggb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBub2RlSW5kZXhPZihjaGlsZDogTm9kZSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gY2hpbGQucGFyZW50Tm9kZTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHBhcmVudFxyXG4gICAgICAgICAgICA/IEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwocGFyZW50LmNoaWxkTm9kZXMsIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVG9nZ2xlcyB0aGUgaGlkZGVuIGF0dHJpYnV0ZSBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgYW5kIGFsbCBpdHMgbGFiZWxzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gdG9nZ2xlIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gZm9yY2UgT3B0aW9uYWwgdmFsdWUgdG8gZm9yY2UgdG9nZ2xpbmcgdG9cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0b2dnbGVIaWRkZW4oZWxlbWVudDogSFRNTEVsZW1lbnQsIGZvcmNlPzogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGhpZGRlbiA9ICFlbGVtZW50LmhpZGRlbjtcclxuXHJcbiAgICAgICAgLy8gRG8gbm90aGluZyBpZiBhbHJlYWR5IHRvZ2dsZWQgdG8gdGhlIGZvcmNlZCBzdGF0ZVxyXG4gICAgICAgIGlmIChoaWRkZW4gPT09IGZvcmNlKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGVsZW1lbnQuaGlkZGVuID0gaGlkZGVuO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZm9yPScke2VsZW1lbnQuaWR9J11gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChsID0+IChsIGFzIEhUTUxFbGVtZW50KS5oaWRkZW4gPSBoaWRkZW4pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVG9nZ2xlcyB0aGUgaGlkZGVuIGF0dHJpYnV0ZSBvZiBhIGdyb3VwIG9mIGVsZW1lbnRzLCBpbiBidWxrLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBsaXN0IEFuIGFycmF5IG9mIGFyZ3VtZW50IHBhaXJzIGZvciB7dG9nZ2xlSGlkZGVufVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRvZ2dsZUhpZGRlbkFsbCguLi5saXN0OiBbSFRNTEVsZW1lbnQsIGJvb2xlYW4/XVtdKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsaXN0LmZvckVhY2goIGwgPT4gdGhpcy50b2dnbGVIaWRkZW4oLi4ubCkgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBBIHZlcnkgc21hbGwgc3Vic2V0IG9mIE1hcmtkb3duIGZvciBoeXBlcmxpbmtpbmcgYSBibG9jayBvZiB0ZXh0ICovXHJcbmNsYXNzIExpbmtkb3duXHJcbntcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rZWQgdGV4dCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVHRVhfTElOSyA9IC9cXFsoW1xcc1xcU10rPylcXF1cXFsoXFxkKylcXF0vZ21pO1xyXG4gICAgLyoqIFJlZ2V4IHBhdHRlcm4gZm9yIG1hdGNoaW5nIGxpbmsgcmVmZXJlbmNlcyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVHRVhfUkVGICA9IC9eXFxbKFxcZCspXFxdOlxccysoXFxTKykkL2dtaTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEF0dGVtcHRzIHRvIGxvYWQgdGhlIGdpdmVuIGxpbmtkb3duIGZpbGUsIHBhcnNlIGFuZCBzZXQgaXQgYXMgYW4gZWxlbWVudCdzIHRleHQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBhdGggUmVsYXRpdmUgb3IgYWJzb2x1dGUgVVJMIHRvIGZldGNoIHRoZSBsaW5rZG93biBmcm9tXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgRE9NIHF1ZXJ5IGZvciB0aGUgb2JqZWN0IHRvIHB1dCB0aGUgdGV4dCBpbnRvXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbG9hZEludG8ocGF0aDogc3RyaW5nLCBxdWVyeTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZG9tID0gRE9NLnJlcXVpcmUocXVlcnkpO1xyXG5cclxuICAgICAgICBkb20uaW5uZXJUZXh0ID0gYExvYWRpbmcgdGV4dCBmcm9tICcke3BhdGh9Jy4uLmA7XHJcblxyXG4gICAgICAgIGZldGNoKHBhdGgpXHJcbiAgICAgICAgICAgIC50aGVuKCByZXEgPT4gcmVxLnRleHQoKSApXHJcbiAgICAgICAgICAgIC50aGVuKCB0eHQgPT4gZG9tLmlubmVySFRNTCA9IExpbmtkb3duLnBhcnNlKHR4dCkgKVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IGRvbS5pbm5lclRleHQgPSBgQ291bGQgbm90IGxvYWQgJyR7cGF0aH0nOiAke2Vycn1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBhcnNlcyB0aGUgZ2l2ZW4gdGV4dCBmcm9tIExpbmtkb3duIHRvIEhUTUwsIGNvbnZlcnRpbmcgdGFnZ2VkIHRleHQgaW50byBsaW5rc1xyXG4gICAgICogdXNpbmcgYSBnaXZlbiBsaXN0IG9mIHJlZmVyZW5jZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRleHQgTGlua2Rvd24gdGV4dCB0byB0cmFuc2Zvcm0gdG8gSFRNTFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBwYXJzZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGxpbmtzIDogRGljdGlvbmFyeTxzdHJpbmc+ID0ge307XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzYW5pdGl6ZSBhbnkgSFRNTFxyXG4gICAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UoJzwnLCAnJmx0OycpLnJlcGxhY2UoJz4nLCAnJmd0OycpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBnZXQgdGhlIGxpc3Qgb2YgcmVmZXJlbmNlcywgcmVtb3ZpbmcgdGhlbSBmcm9tIHRoZSB0ZXh0XHJcbiAgICAgICAgdGV4dCA9IHRleHQucmVwbGFjZSh0aGlzLlJFR0VYX1JFRiwgKF8sIGssIHYpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsaW5rc1trXSA9IHY7XHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluYWxseSwgcmVwbGFjZSBlYWNoIHRhZ2dlZCBwYXJ0IG9mIHRleHQgd2l0aCBhIGxpbmsgZWxlbWVudC4gSWYgYSB0YWcgaGFzXHJcbiAgICAgICAgLy8gYW4gaW52YWxpZCByZWZlcmVuY2UsIGl0IGlzIGlnbm9yZWQuXHJcbiAgICAgICAgcmV0dXJuIHRleHQucmVwbGFjZSh0aGlzLlJFR0VYX0xJTkssIChtYXRjaCwgdCwgaykgPT5cclxuICAgICAgICAgICAgbGlua3Nba11cclxuICAgICAgICAgICAgICAgID8gYDxhIGhyZWY9JyR7bGlua3Nba119JyB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lclwiPiR7dH08L2E+YFxyXG4gICAgICAgICAgICAgICAgOiBtYXRjaFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgenp6LWNyZWF0b3IsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBwYXJzaW5nIGRhdGEgZnJvbSBzdHJpbmdzICovXHJcbmNsYXNzIFBhcnNlXHJcbntcclxuICAgIC8qKiBQYXJzZXMgYSBnaXZlbiBzdHJpbmcgaW50byBhIGJvb2xlYW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vbGVhbihzdHI6IHN0cmluZykgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgc3RyID0gc3RyLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGlmIChzdHIgPT09ICd0cnVlJyAgfHwgc3RyID09PSAnMScpXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIGlmIChzdHIgPT09ICdmYWxzZScgfHwgc3RyID09PSAnMCcpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhyb3cgRXJyb3IoIEwuQkFEX0JPT0xFQU4oc3RyKSApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZ2VuZXJhdGluZyByYW5kb20gZGF0YSAqL1xyXG5jbGFzcyBSYW5kb21cclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBpbnRlZ2VyIGZyb20gdGhlIGdpdmVuIHJhbmdlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBtaW4gTWluaW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHBhcmFtIG1heCBNYXhpbXVtIGludGVnZXIgdG8gcGljaywgaW5jbHVzaXZlXHJcbiAgICAgKiBAcmV0dXJucyBSYW5kb20gaW50ZWdlciB3aXRoaW4gdGhlIGdpdmVuIHJhbmdlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50KG1pbjogbnVtYmVyID0gMCwgbWF4OiBudW1iZXIgPSAxKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBNYXRoLnJvdW5kKCBNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbikgKSArIG1pbjtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZWxlbWVudCBmcm9tIGEgZ2l2ZW4gYXJyYXktbGlrZSBvYmplY3Qgd2l0aCBhIGxlbmd0aCBwcm9wZXJ0eSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheShhcnI6IExlbmd0aGFibGUpIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyclsgUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoIC0gMSkgXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3BsaWNlcyBhIHJhbmRvbSBlbGVtZW50IGZyb20gYSBnaXZlbiBhcnJheSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheVNwbGljZTxUPihhcnI6IFRbXSkgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyci5zcGxpY2UoUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoIC0gMSksIDEpWzBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBrZXkgZnJvbSBhIGdpdmVuIG9iamVjdCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBvYmplY3RLZXkob2JqOiB7fSkgOiBhbnlcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KCBPYmplY3Qua2V5cyhvYmopICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyB0cnVlIG9yIGZhbHNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjaGFuY2UgQ2hhbmNlIG91dCBvZiAxMDAsIHRvIHBpY2sgYHRydWVgXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vbChjaGFuY2U6IG51bWJlciA9IDUwKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmludCgwLCAxMDApIDwgY2hhbmNlO1xyXG4gICAgfVxyXG59XHJcbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IGNsYXNzIGZvciBhdWRpbyBmdW5jdGlvbmFsaXR5ICovXHJcbmNsYXNzIFNvdW5kc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIERlY29kZXMgdGhlIGdpdmVuIGF1ZGlvIGZpbGUgaW50byByYXcgYXVkaW8gZGF0YS4gVGhpcyBpcyBhIHdyYXBwZXIgZm9yIHRoZSBvbGRlclxyXG4gICAgICogY2FsbGJhY2stYmFzZWQgc3ludGF4LCBzaW5jZSBpdCBpcyB0aGUgb25seSBvbmUgaU9TIGN1cnJlbnRseSBzdXBwb3J0cy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBBdWRpbyBjb250ZXh0IHRvIHVzZSBmb3IgZGVjb2RpbmdcclxuICAgICAqIEBwYXJhbSBidWZmZXIgQnVmZmVyIG9mIGVuY29kZWQgZmlsZSBkYXRhIChlLmcuIG1wMykgdG8gZGVjb2RlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXN5bmMgZGVjb2RlKGNvbnRleHQ6IEF1ZGlvQ29udGV4dCwgYnVmZmVyOiBBcnJheUJ1ZmZlcilcclxuICAgICAgICA6IFByb21pc2U8QXVkaW9CdWZmZXI+XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlIDxBdWRpb0J1ZmZlcj4gKCAocmVzb2x2ZSwgcmVqZWN0KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQuZGVjb2RlQXVkaW9EYXRhKGJ1ZmZlciwgcmVzb2x2ZSwgcmVqZWN0KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBzdHJpbmdzICovXHJcbmNsYXNzIFN0cmluZ3Ncclxue1xyXG4gICAgLyoqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gc3RyaW5nIGlzIG51bGwsIG9yIGVtcHR5ICh3aGl0ZXNwYWNlIG9ubHkgb3IgemVyby1sZW5ndGgpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzTnVsbE9yRW1wdHkoc3RyOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gIXN0ciB8fCAhc3RyLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludCdzIGEgZ2l2ZW4gbGlzdCBvZiBzdGF0aW9ucywgd2l0aCBjb250ZXh0IHNlbnNpdGl2ZSBleHRyYXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGVzIExpc3Qgb2Ygc3RhdGlvbiBjb2RlcyB0byBqb2luXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBMaXN0J3MgY29udGV4dC4gSWYgJ2NhbGxpbmcnLCBoYW5kbGVzIHNwZWNpYWwgY2FzZVxyXG4gICAgICogQHJldHVybnMgUHJldHR5LXByaW50ZWQgbGlzdCBvZiBnaXZlbiBzdGF0aW9uc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21TdGF0aW9uTGlzdChjb2Rlczogc3RyaW5nW10sIGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gJyc7XHJcbiAgICAgICAgbGV0IG5hbWVzICA9IGNvZGVzLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIG5hbWVzLmZvckVhY2goIChjLCBpKSA9PiBuYW1lc1tpXSA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGMpICk7XHJcblxyXG4gICAgICAgIGlmIChuYW1lcy5sZW5ndGggPT09IDEpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IChjb250ZXh0ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgICAgICA/IGAke25hbWVzWzBdfSBvbmx5YFxyXG4gICAgICAgICAgICAgICAgOiBuYW1lc1swXTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFzdFN0YXRpb24gPSBuYW1lcy5wb3AoKTtcclxuXHJcbiAgICAgICAgICAgIHJlc3VsdCAgPSBuYW1lcy5qb2luKCcsICcpO1xyXG4gICAgICAgICAgICByZXN1bHQgKz0gYCBhbmQgJHtsYXN0U3RhdGlvbn1gO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludHMgdGhlIGdpdmVuIGRhdGUgb3IgaG91cnMgYW5kIG1pbnV0ZXMgaW50byBhIDI0LWhvdXIgdGltZSAoZS5nLiAwMTowOSkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGhvdXJzIEhvdXJzLCBmcm9tIDAgdG8gMjMsIG9yIERhdGUgb2JqZWN0XHJcbiAgICAgKiBAcGFyYW0gbWludXRlcyBNaW51dGVzLCBmcm9tIDAgdG8gNTlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tVGltZShob3VyczogbnVtYmVyIHwgRGF0ZSwgbWludXRlczogbnVtYmVyID0gMCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoaG91cnMgaW5zdGFuY2VvZiBEYXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWludXRlcyA9IGhvdXJzLmdldE1pbnV0ZXMoKTtcclxuICAgICAgICAgICAgaG91cnMgICA9IGhvdXJzLmdldEhvdXJzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gaG91cnMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpICsgJzonICtcclxuICAgICAgICAgICAgbWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFucyB1cCB0aGUgZ2l2ZW4gdGV4dCBvZiBleGNlc3Mgd2hpdGVzcGFjZSBhbmQgYW55IG5ld2xpbmVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsZWFuKHRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGV4dC50cmltKClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXG5cXHJdL2dpLCAgICcnICApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHN7Mix9L2dpLCAgICcgJyApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC/igJxcXHMrL2dpLCAgICAgJ+KAnCcgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzK+KAnS9naSwgICAgICfigJ0nIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyhbLixdKS9naSwgJyQxJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0cm9uZ2x5IGNvbXByZXNzZXMgdGhlIGdpdmVuIHN0cmluZyB0byBvbmUgbW9yZSBmaWxlbmFtZSBmcmllbmRseSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWxlbmFtZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgLy8gUmVwbGFjZSBwbHVyYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pZXNcXGIvZywgJ3knKVxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgY29tbW9uIHdvcmRzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGIoYXxhbnxhdHxiZXxvZnxvbnx0aGV8dG98aW58aXN8aGFzfGJ5fHdpdGgpXFxiL2csICcnKVxyXG4gICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgIC8vIENvbnZlcnQgc3BhY2VzIHRvIHVuZGVyc2NvcmVzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrL2csICdfJylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFsbCBub24tYWxwaGFudW1lcmljYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXmEtejAtOV9dL2csICcnKVxyXG4gICAgICAgICAgICAvLyBMaW1pdCB0byAxMDAgY2hhcnM7IG1vc3Qgc3lzdGVtcyBzdXBwb3J0IG1heC4gMjU1IGJ5dGVzIGluIGZpbGVuYW1lc1xyXG4gICAgICAgICAgICAuc3Vic3RyaW5nKDAsIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGZpcnN0IG1hdGNoIG9mIGEgcGF0dGVybiBpbiBhIHN0cmluZywgb3IgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaXJzdE1hdGNoKHRleHQ6IHN0cmluZywgcGF0dGVybjogUmVnRXhwLCBpZHg6IG51bWJlcilcclxuICAgICAgICA6IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBtYXRjaCA9IHRleHQubWF0Y2gocGF0dGVybik7XHJcblxyXG4gICAgICAgIHJldHVybiAobWF0Y2ggJiYgbWF0Y2hbaWR4XSlcclxuICAgICAgICAgICAgPyBtYXRjaFtpZHhdXHJcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFVuaW9uIHR5cGUgZm9yIGl0ZXJhYmxlIHR5cGVzIHdpdGggYSAubGVuZ3RoIHByb3BlcnR5ICovXHJcbnR5cGUgTGVuZ3RoYWJsZSA9IEFycmF5PGFueT4gfCBOb2RlTGlzdCB8IEhUTUxDb2xsZWN0aW9uIHwgc3RyaW5nO1xyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBwbGF0Zm9ybSBhcyBhIGRpZ2l0IGFuZCBvcHRpb25hbCBsZXR0ZXIgdHVwbGUgKi9cclxudHlwZSBQbGF0Zm9ybSA9IFtzdHJpbmcsIHN0cmluZ107XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHN0YXRpb24gbmFtZSwgd2hpY2ggY2FuIGJlIGEgc2ltcGxlIHN0cmluZyBvciBjb21wbGV4IG9iamVjdCAqL1xyXG50eXBlIFN0YXRpb24gPSBzdHJpbmcgfCBTdGF0aW9uRGVmO1xyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBjb21wbGV4IHN0YXRpb24gbmFtZSBkZWZpbml0aW9uICovXHJcbmludGVyZmFjZSBTdGF0aW9uRGVmXHJcbntcclxuICAgIC8qKiBDYW5vbmljYWwgbmFtZSBvZiB0aGUgc3RhdGlvbiAqL1xyXG4gICAgbmFtZSAgICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIFN0YXRpb24gY29kZSB0byB1c2UgdGhlIHNhbWUgcmVjb3JkaW5nIG9mICovXHJcbiAgICB2b3hBbGlhcz8gOiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgZ2VuZXJpYyBrZXktdmFsdWUgZGljdGlvbmFyeSwgd2l0aCBzdHJpbmcga2V5cyAqL1xyXG50eXBlIERpY3Rpb25hcnk8VD4gPSB7IFtpbmRleDogc3RyaW5nXTogVCB9O1xyXG5cclxuLyoqIERlZmluZXMgdGhlIGRhdGEgcmVmZXJlbmNlcyBjb25maWcgb2JqZWN0IHBhc3NlZCBpbnRvIFJBRy5tYWluIG9uIGluaXQgKi9cclxuaW50ZXJmYWNlIERhdGFSZWZzXHJcbntcclxuICAgIC8qKiBTZWxlY3RvciBmb3IgZ2V0dGluZyB0aGUgcGhyYXNlIHNldCBYTUwgSUZyYW1lIGVsZW1lbnQgKi9cclxuICAgIHBocmFzZXNldEVtYmVkIDogc3RyaW5nO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBleGN1c2VzIGZvciB0cmFpbiBkZWxheXMgb3IgY2FuY2VsbGF0aW9ucyB0byB1c2UgKi9cclxuICAgIGV4Y3VzZXNEYXRhICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzcGVjaWFsIHRyYWlucyB0byB1c2UgKi9cclxuICAgIG5hbWVkRGF0YSAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzZXJ2aWNlcy9uZXR3b3JrcyB0byB1c2UgKi9cclxuICAgIHNlcnZpY2VzRGF0YSAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBjb2RlcyBhbmQgbmFtZXMgdG8gdXNlICovXHJcbiAgICBzdGF0aW9uc0RhdGEgICA6IERpY3Rpb25hcnk8c3RyaW5nPjtcclxuICAgIC8qKlxyXG4gICAgICogUm9sZSB0aGUgcGFnZSBib290cyBpbiwgc2V0IGJ5IHRoZSBwYWdlJ3MgYm9vdCBzY3JpcHQ6ICdkYXNoYm9hcmQnXHJcbiAgICAgKiAoY29udHJvbGxlcikgb3IgJ2VkaXRvcicgKG1haW4gc2NyZWVuKS4gV2hlbiBhYnNlbnQsIHRoZSByb2xlIGZhbGxzXHJcbiAgICAgKiBiYWNrIHRvIHRoZSBVUkwgZmxhZyAoaW5kZXguaHRtbD9kYXNoYm9hcmQ9MSkuXHJcbiAgICAgKi9cclxuICAgIGJvb3RSb2xlPyAgICAgIDogc3RyaW5nO1xyXG59XHJcblxyXG4vKiogRmlsbCBpbnMgZm9yIHZhcmlvdXMgbWlzc2luZyBkZWZpbml0aW9ucyBvZiBtb2Rlcm4gSmF2YXNjcmlwdCBmZWF0dXJlcyAqL1xyXG5cclxuaW50ZXJmYWNlIFdpbmRvd1xyXG57XHJcbiAgICBvbnVuaGFuZGxlZHJlamVjdGlvbjogRXJyb3JFdmVudEhhbmRsZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBcnJheTxUPlxyXG57XHJcbiAgICBpbmNsdWRlcyhzZWFyY2hFbGVtZW50OiBULCBmcm9tSW5kZXg/OiBudW1iZXIpIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEVycm9yQ29uc3RydWN0b3Jcclxue1xyXG4gICAgY2FwdHVyZVN0YWNrVHJhY2UodGFyZ2V0OiBhbnksIGN0b3I/OiBGdW5jdGlvbikgOiB2b2lkO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSFRNTEVsZW1lbnRcclxue1xyXG4gICAgbGFiZWxzIDogTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XHJcbn1cclxuXHJcbmludGVyZmFjZSBTdHJpbmdcclxue1xyXG4gICAgcGFkU3RhcnQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbiAgICBwYWRFbmQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBdWRpb0NvbnRleHRCYXNlXHJcbntcclxuICAgIGF1ZGlvV29ya2xldCA6IEF1ZGlvV29ya2xldDtcclxufVxyXG5cclxudHlwZSBTYW1wbGVDaGFubmVscyA9IEZsb2F0MzJBcnJheVtdW107XHJcblxyXG5kZWNsYXJlIGNsYXNzIEF1ZGlvV29ya2xldFByb2Nlc3NvclxyXG57XHJcbiAgICBzdGF0aWMgcGFyYW1ldGVyRGVzY3JpcHRvcnMgOiBBdWRpb1BhcmFtRGVzY3JpcHRvcltdO1xyXG5cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3RvcihvcHRpb25zPzogQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMpO1xyXG4gICAgcmVhZG9ubHkgcG9ydD86IE1lc3NhZ2VQb3J0O1xyXG5cclxuICAgIHByb2Nlc3MoXHJcbiAgICAgICAgaW5wdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBvdXRwdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBwYXJhbWV0ZXJzOiBEaWN0aW9uYXJ5PEZsb2F0MzJBcnJheT5cclxuICAgICkgOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMgZXh0ZW5kcyBBdWRpb05vZGVPcHRpb25zXHJcbntcclxuICAgIG51bWJlck9mSW5wdXRzPyA6IG51bWJlcjtcclxuICAgIG51bWJlck9mT3V0cHV0cz8gOiBudW1iZXI7XHJcbiAgICBvdXRwdXRDaGFubmVsQ291bnQ/IDogbnVtYmVyW107XHJcbiAgICBwYXJhbWV0ZXJEYXRhPyA6IHtbaW5kZXg6IHN0cmluZ10gOiBudW1iZXJ9O1xyXG4gICAgcHJvY2Vzc29yT3B0aW9ucz8gOiBhbnk7XHJcbn1cclxuXHJcbmludGVyZmFjZSBNZWRpYVRyYWNrQ29uc3RyYWludFNldFxyXG57XHJcbiAgICBhdXRvR2FpbkNvbnRyb2w/OiBib29sZWFuIHwgQ29uc3RyYWluQm9vbGVhblBhcmFtZXRlcnM7XHJcbiAgICBub2lzZVN1cHByZXNzaW9uPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG59XHJcblxyXG5kZWNsYXJlIGZ1bmN0aW9uIHJlZ2lzdGVyUHJvY2Vzc29yKG5hbWU6IHN0cmluZywgY3RvcjogQXVkaW9Xb3JrbGV0UHJvY2Vzc29yKSA6IHZvaWQ7IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IHp6ei1jcmVhdG9yLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENyb3NzLXdpbmRvdyBjb21tdW5pY2F0aW9uIGNoYW5uZWwgdXNpbmcgQnJvYWRjYXN0Q2hhbm5lbCAqL1xyXG5jbGFzcyBTY2VuYXJpb0NoYW5uZWxcclxue1xyXG4gICAgcHJpdmF0ZSBjaGFubmVsOiBCcm9hZGNhc3RDaGFubmVsIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGxpc3RlbmVyczogeyBbdHlwZTogc3RyaW5nXTogQXJyYXk8KGRhdGE6IGFueSkgPT4gdm9pZD4gfSA9IHt9O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBCcm9hZGNhc3RDaGFubmVsICE9PSAndW5kZWZpbmVkJylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRyeVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5uZWwgPSBuZXcgQnJvYWRjYXN0Q2hhbm5lbCgncmFnX3NjZW5hcmlvX2NoYW5uZWwnKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hhbm5lbC5vbm1lc3NhZ2UgPSAoZXZlbnQ6IE1lc3NhZ2VFdmVudCkgPT5cclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgbXNnID0gZXZlbnQuZGF0YTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobXNnICYmIG1zZy50eXBlKVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGhhbmRsZXJzID0gdGhpcy5saXN0ZW5lcnNbbXNnLnR5cGVdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGFuZGxlcnMpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZXJzLmZvckVhY2goaCA9PiBoKG1zZykpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaCAoZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdCcm9hZGNhc3RDaGFubmVsIG5vdCBzdXBwb3J0ZWQgb3IgZmFpbGVkOicsIGUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBvbih0eXBlOiBzdHJpbmcsIGhhbmRsZXI6IChkYXRhOiBhbnkpID0+IHZvaWQpOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxpc3RlbmVyc1t0eXBlXSlcclxuICAgICAgICAgICAgdGhpcy5saXN0ZW5lcnNbdHlwZV0gPSBbXTtcclxuXHJcbiAgICAgICAgdGhpcy5saXN0ZW5lcnNbdHlwZV0ucHVzaChoYW5kbGVyKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgb2ZmKHR5cGU6IHN0cmluZywgaGFuZGxlcjogKGRhdGE6IGFueSkgPT4gdm9pZCk6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaGFuZGxlcnMgPSB0aGlzLmxpc3RlbmVyc1t0eXBlXTtcclxuICAgICAgICBpZiAoIWhhbmRsZXJzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCBpID0gaGFuZGxlcnMuaW5kZXhPZihoYW5kbGVyKTtcclxuICAgICAgICBpZiAoaSAhPT0gLTEpXHJcbiAgICAgICAgICAgIGhhbmRsZXJzLnNwbGljZShpLCAxKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc2VuZCh0eXBlOiBzdHJpbmcsIHBheWxvYWQ6IGFueSA9IHt9KTogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmNoYW5uZWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0cnlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGFubmVsLnBvc3RNZXNzYWdlKE9iamVjdC5hc3NpZ24oeyB0eXBlOiB0eXBlIH0sIHBheWxvYWQpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaCAoZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gc2VuZCBCcm9hZGNhc3RDaGFubmVsIG1lc3NhZ2U6JywgZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbih3aW5kb3cgYXMgYW55KS5TY2VuYXJpb0NoYW5uZWwgPSBTY2VuYXJpb0NoYW5uZWw7XHJcbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIGRhdGEgZm9yIGV4Y3VzZXMsIHRyYWlucywgc2VydmljZXMgYW5kIHN0YXRpb25zICovXHJcbmNsYXNzIERhdGFiYXNlXHJcbntcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBkZWxheSBvciBjYW5jZWxsYXRpb24gZXhjdXNlcyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBleGN1c2VzICAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2YgbmFtZWQgdHJhaW5zICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG5hbWVkICAgICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBzZXJ2aWNlIG9yIG5ldHdvcmsgbmFtZXMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc2VydmljZXMgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkaWN0aW9uYXJ5IG9mIHN0YXRpb24gbmFtZXMsIHdpdGggdGhyZWUtbGV0dGVyIGNvZGUga2V5cyAoZS5nLiBBQkMpICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHN0YXRpb25zICAgICAgOiBEaWN0aW9uYXJ5PFN0YXRpb24+O1xyXG4gICAgLyoqIExvYWRlZCBYTUwgZG9jdW1lbnQgY29udGFpbmluZyBwaHJhc2VzZXQgZGF0YSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBwaHJhc2VzZXRzICAgIDogRG9jdW1lbnQ7XHJcbiAgICAvKiogQW1vdW50IG9mIHN0YXRpb25zIGluIHRoZSBjdXJyZW50bHkgbG9hZGVkIGRhdGFzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc3RhdGlvbnNDb3VudCA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZGF0YVJlZnM6IERhdGFSZWZzKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSAgPSBkYXRhUmVmcy5waHJhc2VzZXRFbWJlZDtcclxuICAgICAgICBsZXQgaWZyYW1lID0gRE9NLnJlcXVpcmUgPEhUTUxJRnJhbWVFbGVtZW50PiAocXVlcnkpO1xyXG5cclxuICAgICAgICBpZiAoIWlmcmFtZS5jb250ZW50RG9jdW1lbnQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUocXVlcnkpICk7XHJcblxyXG4gICAgICAgIHRoaXMucGhyYXNlc2V0cyAgICA9IGlmcmFtZS5jb250ZW50RG9jdW1lbnQ7XHJcbiAgICAgICAgdGhpcy5leGN1c2VzICAgICAgID0gZGF0YVJlZnMuZXhjdXNlc0RhdGE7XHJcbiAgICAgICAgdGhpcy5uYW1lZCAgICAgICAgID0gZGF0YVJlZnMubmFtZWREYXRhO1xyXG4gICAgICAgIHRoaXMuc2VydmljZXMgICAgICA9IGRhdGFSZWZzLnNlcnZpY2VzRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zICAgICAgPSBkYXRhUmVmcy5zdGF0aW9uc0RhdGE7XHJcbiAgICAgICAgdGhpcy5zdGF0aW9uc0NvdW50ID0gT2JqZWN0LmtleXModGhpcy5zdGF0aW9ucykubGVuZ3RoO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnW0RhdGFiYXNlXSBFbnRyaWVzIGxvYWRlZDonKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0RXhjdXNlczonLCAgICAgIHRoaXMuZXhjdXNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHROYW1lZCB0cmFpbnM6JywgdGhpcy5uYW1lZC5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTZXJ2aWNlczonLCAgICAgdGhpcy5zZXJ2aWNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTdGF0aW9uczonLCAgICAgdGhpcy5zdGF0aW9uc0NvdW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZXhjdXNlIGZvciBhIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiAqL1xyXG4gICAgcHVibGljIHBpY2tFeGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5leGN1c2VzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBwaWNrTmFtZWQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5uYW1lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgYW5kIGdldHMgcGhyYXNlIHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2UgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZSMnICsgaWQpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAocmVzdWx0KVxyXG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHBocmFzZXNldCB3aXRoIHRoZSBnaXZlbiBJRCwgb3IgbnVsbCBpZiBpdCBkb2Vzbid0IGV4aXN0LiBOb3RlIHRoYXQgdGhlXHJcbiAgICAgKiByZXR1cm5lZCBwaHJhc2VzZXQgY29tZXMgZnJvbSB0aGUgWE1MIGRvY3VtZW50LCBzbyBpdCBzaG91bGQgbm90IGJlIG11dGF0ZWQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2VzZXQgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2VzZXQoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZXNldCMnICsgaWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSByYWlsIG5ldHdvcmsgbmFtZSAqL1xyXG4gICAgcHVibGljIHBpY2tTZXJ2aWNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMuc2VydmljZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gc3RhdGlvbiBjb2RlIGZyb20gdGhlIGRhdGFzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGUgTGlzdCBvZiBjb2RlcyB0byBleGNsdWRlLiBNYXkgYmUgaWdub3JlZCBpZiBzZWFyY2ggdGFrZXMgdG9vIGxvbmcuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwaWNrU3RhdGlvbkNvZGUoZXhjbHVkZT86IHN0cmluZ1tdKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIC8vIEdpdmUgdXAgZmluZGluZyByYW5kb20gc3RhdGlvbiB0aGF0J3Mgbm90IGluIHRoZSBnaXZlbiBsaXN0LCBpZiB3ZSB0cnkgbW9yZVxyXG4gICAgICAgIC8vIHRpbWVzIHRoZW4gdGhlcmUgYXJlIHN0YXRpb25zLiBJbmFjY3VyYXRlLCBidXQgYXZvaWRzIGluZmluaXRlIGxvb3BzLlxyXG4gICAgICAgIGlmIChleGNsdWRlKSBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc3RhdGlvbnNDb3VudDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHZhbHVlID0gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuXHJcbiAgICAgICAgICAgIGlmICggIWV4Y2x1ZGUuaW5jbHVkZXModmFsdWUpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgc3RhdGlvbiBuYW1lIGZyb20gdGhlIGdpdmVuIHRocmVlIGxldHRlciBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gZ2V0IHRoZSBuYW1lIG9mXHJcbiAgICAgKiBAcmV0dXJucyBTdGF0aW9uIG5hbWUgZm9yIHRoZSBnaXZlbiBjb2RlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uKGNvZGU6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IHRoaXMuc3RhdGlvbnNbY29kZV07XHJcblxyXG4gICAgICAgIGlmICghc3RhdGlvbilcclxuICAgICAgICAgICAgcmV0dXJuIEwuREJfVU5LTk9XTl9TVEFUSU9OKGNvZGUpO1xyXG5cclxuICAgICAgICBpZiAodHlwZW9mIHN0YXRpb24gPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gU3RyaW5ncy5pc051bGxPckVtcHR5KHN0YXRpb24pXHJcbiAgICAgICAgICAgICAgICA/IEwuREJfRU1QVFlfU1RBVElPTihjb2RlKVxyXG4gICAgICAgICAgICAgICAgOiBzdGF0aW9uO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcmV0dXJuICFzdGF0aW9uLm5hbWVcclxuICAgICAgICAgICAgICAgID8gTC5EQl9FTVBUWV9TVEFUSU9OKGNvZGUpXHJcbiAgICAgICAgICAgICAgICA6IHN0YXRpb24ubmFtZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSdzIHZveCBhbGlhcywgaWYgYW55LiBBIHZveCBhbGlhcyBpcyB0aGUgY29kZSBvZiBhbm90aGVyXHJcbiAgICAgKiBzdGF0aW9uJ3Mgdm9pY2UgZmlsZSwgdGhhdCB0aGUgZ2l2ZW4gY29kZSBzaG91bGQgdXNlIGluc3RlYWQuIFRoaXMgaXMgdXNlZCBmb3JcclxuICAgICAqIHN0YXRpb25zIHdpdGggZHVwbGljYXRlIG5hbWVzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFN0YXRpb24gY29kZSB0byBnZXQgdGhlIHZveCBhbGlhcyBvZlxyXG4gICAgICogQHJldHVybnMgVGhlIGFsaWFzIGNvZGUsIGVsc2UgdGhlIGdpdmVuIGNvZGVcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb25Wb3goY29kZTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gdGhpcy5zdGF0aW9uc1tjb2RlXTtcclxuXHJcbiAgICAgICAgLy8gVW5rbm93biBzdGF0aW9uXHJcbiAgICAgICAgaWYgICAgICAoIXN0YXRpb24pXHJcbiAgICAgICAgICAgIHJldHVybiAnPz8/JztcclxuICAgICAgICAvLyBTdGF0aW9uIGlzIGp1c3QgYSBzdHJpbmc7IGFzc3VtZSBubyBhbGlhc1xyXG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBzdGF0aW9uID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgcmV0dXJuIGNvZGU7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gZWl0aGVyKHN0YXRpb24udm94QWxpYXMsIGNvZGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gcmFuZ2Ugb2Ygc3RhdGlvbiBjb2RlcywgZW5zdXJpbmcgdGhlcmUgYXJlIG5vIGR1cGxpY2F0ZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIG1pbiBNaW5pbXVtIGFtb3VudCBvZiBzdGF0aW9ucyB0byBwaWNrXHJcbiAgICAgKiBAcGFyYW0gbWF4IE1heGltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBleGNsdWRlXHJcbiAgICAgKiBAcmV0dXJucyBBIGxpc3Qgb2YgdW5pcXVlIHN0YXRpb24gbmFtZXNcclxuICAgICAqL1xyXG4gICAgcHVibGljIHBpY2tTdGF0aW9uQ29kZXMobWluID0gMSwgbWF4ID0gMTYsIGV4Y2x1ZGU/IDogc3RyaW5nW10pIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBpZiAobWF4IC0gbWluID4gT2JqZWN0LmtleXModGhpcy5zdGF0aW9ucykubGVuZ3RoKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQl9UT09fTUFOWV9TVEFUSU9OUygpICk7XHJcblxyXG4gICAgICAgIGxldCByZXN1bHQ6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgICAgIGxldCBsZW5ndGggPSBSYW5kb20uaW50KG1pbiwgbWF4KTtcclxuICAgICAgICBsZXQgdHJpZXMgID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHJlc3VsdC5sZW5ndGggPCBsZW5ndGgpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQga2V5ID0gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEdpdmUgdXAgdHJ5aW5nIHRvIGF2b2lkIGR1cGxpY2F0ZXMsIGlmIHdlIHRyeSBtb3JlIHRpbWVzIHRoYW4gdGhlcmUgYXJlXHJcbiAgICAgICAgICAgIC8vIHN0YXRpb25zIGF2YWlsYWJsZS4gSW5hY2N1cmF0ZSwgYnV0IGdvb2QgZW5vdWdoLlxyXG4gICAgICAgICAgICBpZiAodHJpZXMrKyA+PSB0aGlzLnN0YXRpb25zQ291bnQpXHJcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgZ2l2ZW4gYW4gZXhjbHVzaW9uIGxpc3QsIGNoZWNrIGFnYWluc3QgYm90aCB0aGF0IGFuZCByZXN1bHRzXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCBleGNsdWRlICYmICFleGNsdWRlLmluY2x1ZGVzKGtleSkgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBub3QsIGp1c3QgY2hlY2sgd2hhdCByZXN1bHRzIHdlJ3ZlIGFscmVhZHkgZm91bmRcclxuICAgICAgICAgICAgZWxzZSBpZiAoICFleGNsdWRlICYmICFyZXN1bHQuaW5jbHVkZXMoa2V5KSApXHJcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYWluIGNsYXNzIG9mIHRoZSBlbnRpcmUgUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvciBhcHBsaWNhdGlvbiAqL1xyXG5jbGFzcyBSQUdcclxue1xyXG4gICAgLyoqIEdldHMgdGhlIGNvbmZpZ3VyYXRpb24gY29udGFpbmVyICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvbmZpZyAgICA6IENvbmZpZztcclxuICAgIC8qKiBHZXRzIHRoZSBkYXRhYmFzZSBtYW5hZ2VyLCB3aGljaCBob2xkcyBwaHJhc2UsIHN0YXRpb24gYW5kIHRyYWluIGRhdGEgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGF0YWJhc2UgIDogRGF0YWJhc2U7XHJcbiAgICAvKiogR2V0cyB0aGUgcGhyYXNlIG1hbmFnZXIsIHdoaWNoIGdlbmVyYXRlcyBIVE1MIHBocmFzZXMgZnJvbSBYTUwgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGhyYXNlciAgIDogUGhyYXNlcjtcclxuICAgIC8qKiBHZXRzIHRoZSBzcGVlY2ggZW5naW5lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNwZWVjaCAgICA6IFNwZWVjaDtcclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHRyYWluIGFuZCBzdGF0aW9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRlICAgICA6IFN0YXRlO1xyXG4gICAgLyoqIEdldHMgdGhlIHZpZXcgY29udHJvbGxlciwgd2hpY2ggbWFuYWdlcyBVSSBpbnRlcmFjdGlvbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB2aWV3cyAgICAgOiBWaWV3cztcclxuICAgIC8qKiBHZXRzIHRoZSBzY2VuYXJpbyBydW5uZXIsIHdoaWNoIGNoYWlucyBhbm5vdW5jZW1lbnRzIGludG8gYSBzZXF1ZW5jZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzY2VuYXJpbyAgOiBTY2VuYXJpbztcclxuICAgIC8qKiBHZXRzIHRoZSBzY2VuYXJpbyBkYXNoYm9hcmQgY29udHJvbGxlciAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBkYXNoYm9hcmQgOiBTY2VuYXJpb0Rhc2hib2FyZDtcclxuICAgIC8qKiBDcm9zcy13aW5kb3cgbWVzc2FnaW5nIGNoYW5uZWwgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2hhbm5lbCAgIDogU2NlbmFyaW9DaGFubmVsO1xyXG4gICAgLyoqIFJvbGUgdGhpcyBwYWdlIGJvb3RlZCBpbiAoJ2Rhc2hib2FyZCcgLyAnZWRpdG9yJyksIGZyb20gdGhlIGJvb3Qgc2NyaXB0ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJvb3RSb2xlICA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogRW50cnkgcG9pbnQgZm9yIFJBRywgdG8gYmUgY2FsbGVkIGZyb20gSmF2YXNjcmlwdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZGF0YVJlZnMgQ29uZmlndXJhdGlvbiBvYmplY3QsIHdpdGggcmFpbCBkYXRhIHRvIHVzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG1haW4oZGF0YVJlZnM6IERhdGFSZWZzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cub25lcnJvciAgICAgICAgICAgICAgPSBlcnJvciA9PiBSQUcucGFuaWMoZXJyb3IpO1xyXG4gICAgICAgIHdpbmRvdy5vbnVuaGFuZGxlZHJlamVjdGlvbiA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcblxyXG4gICAgICAgIFJBRy5ib290Um9sZSA9IGRhdGFSZWZzLmJvb3RSb2xlIHx8ICcnO1xyXG5cclxuICAgICAgICBJMThuLmluaXQoKTtcclxuXHJcbiAgICAgICAgUkFHLmNvbmZpZyAgICA9IG5ldyBDb25maWcodHJ1ZSk7XHJcbiAgICAgICAgUkFHLmRhdGFiYXNlICA9IG5ldyBEYXRhYmFzZShkYXRhUmVmcyk7XHJcbiAgICAgICAgUkFHLnBocmFzZXIgICA9IG5ldyBQaHJhc2VyKCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaCAgICA9IG5ldyBTcGVlY2goKTtcclxuICAgICAgICBSQUcuc2NlbmFyaW8gID0gbmV3IFNjZW5hcmlvKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzICAgICA9IG5ldyBWaWV3cygpO1xyXG4gICAgICAgIFJBRy5kYXNoYm9hcmQgPSBuZXcgU2NlbmFyaW9EYXNoYm9hcmQoKTtcclxuICAgICAgICBSQUcuY2hhbm5lbCAgID0gbmV3IFNjZW5hcmlvQ2hhbm5lbCgpO1xyXG5cclxuICAgICAgICAvLyBSZWdpc3RlciBjcm9zcy13aW5kb3cgbGlzdGVuZXJzIG9uIG1haW4gaW5kZXguaHRtbCBwYWdlXHJcbiAgICAgICAgUkFHLnJlZ2lzdGVyQ2hhbm5lbEhhbmRsZXJzKCk7XHJcblxyXG4gICAgICAgIC8vIEJlZ2luXHJcbiAgICAgICAgUkFHLnZpZXdzLmRpc2NsYWltZXIuZGlzY2xhaW0oKTtcclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoTC5XRUxDT01FKTtcclxuICAgICAgICBSQUcuZ2VuZXJhdGUoKTtcclxuXHJcbiAgICAgICAgLy8gUGluZyBkYXNoYm9hcmQgaWYgb3BlblxyXG4gICAgICAgIFJBRy5jaGFubmVsLnNlbmQoJ1BPTkcnLCB7IHN0YXRlSnNvbjogSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKSB9KTtcclxuXHJcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHRoaXMgcGFnZSdzIHJvbGUuIFRoZSBkYXNoYm9hcmQgcm9sZSAoaW5kZXguaHRtbCkgaXMgdGhlXHJcbiAgICAgICAgLy8gdGVybWluYWw6IGJ1aWxkIC8gbWFuYWdlIC8gcnVuIHNjZW5hcmlvcyBhbmQgZWRpdCBzdGVwcyBpbiBpdHNcclxuICAgICAgICAvLyBpbi1wYWdlIGVkaXRvci4gVGhlIHNjcmVlbiByb2xlIChzY3JlZW4uaHRtbCkgaXMgYSBtYXJxdWVlLW9ubHlcclxuICAgICAgICAvLyBkaXNwbGF5IHRoYXQgbWlycm9ycyBwbGF5YmFjayBvdmVyIHRoZSBjaGFubmVsLlxyXG4gICAgICAgIGlmIChSQUcuaXNEYXNoYm9hcmRSb2xlKCkpXHJcbiAgICAgICAgICAgIFJBRy5kYXNoYm9hcmQub3BlbigpO1xyXG4gICAgICAgIGVsc2UgaWYgKFJBRy5pc1NjcmVlblJvbGUoKSlcclxuICAgICAgICAgICAgUkFHLnNldHVwRGlzcGxheVJvbGUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVHJ1ZSB3aGVuIHRoaXMgcGFnZSBib290ZWQgaW4gdGhlIGRhc2hib2FyZCAodGVybWluYWwpIHJvbGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNEYXNoYm9hcmRSb2xlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJBRy5ib290Um9sZSA9PT0gJ2Rhc2hib2FyZCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRydWUgd2hlbiB0aGlzIHBhZ2UgYm9vdGVkIGluIHRoZSBzY3JlZW4gKGRpc3BsYXkpIHJvbGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNTY3JlZW5Sb2xlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJBRy5ib290Um9sZSA9PT0gJ3NjcmVlbic7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTY3JlZW4gcm9sZTogdGhpcyBwYWdlIGlzIGEgbWFycXVlZS1vbmx5IGRpc3BsYXkuIEhpZGUgdGhlIHRvb2xiYXIgYW5kXHJcbiAgICAgKiB0aGUgcGhyYXNlIGVkaXRvciBzbyBvbmx5IHRoZSBzY3JvbGxpbmcgYm9hcmQgaXMgdmlzaWJsZTsgcGxheWJhY2sgaXNcclxuICAgICAqIGRyaXZlbiBvdmVyIHRoZSBjaGFubmVsIChQTEFZXyogLyBXQUlUX0NPVU5URE9XTiAvIFNUT1BfUExBWUJBQ0spIGFuZFxyXG4gICAgICogbmV2ZXIgc3BlYWtzIGhlcmUsIHNvIHRoZSB2b2ljZSBpcyBub3QgZG91YmxlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgc2V0dXBEaXNwbGF5Um9sZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0b29sYmFyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Rvb2xiYXInKTtcclxuICAgICAgICBpZiAodG9vbGJhcilcclxuICAgICAgICAgICAgdG9vbGJhci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG5cclxuICAgICAgICBsZXQgZWRpdG9yID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VkaXRvcicpO1xyXG4gICAgICAgIGlmIChlZGl0b3IpXHJcbiAgICAgICAgICAgIGVkaXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRWRpdG9yIHJvbGU6IG1pcnJvciBhIHN0ZXAgdGhlIGRhc2hib2FyZCBpcyBydW5uaW5nIGludG8gdGhlIG1hcnF1ZWUuXHJcbiAgICAgKiBEaXNwbGF5LW9ubHkgb24gcHVycG9zZTogdGhlIGRhc2hib2FyZCB0YWIgb3ducyB0aGUgYXVkaW8sIGFuZCBzcGVha2luZ1xyXG4gICAgICogaGVyZSB0b28gd291bGQgZG91YmxlIHRoZSB2b2ljZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWlycm9yU3RlcChtc2c6IGFueSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFSQUcudmlld3MpIHJldHVybjtcclxuICAgICAgICBsZXQgdGV4dCA9IChtc2cgJiYgbXNnLnRleHQpID8gU3RyaW5nKG1zZy50ZXh0KSA6ICcnO1xyXG4gICAgICAgIGlmICh0ZXh0KVxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQodGV4dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZ2lzdGVyIGNoYW5uZWwgaGFuZGxlcnMgZm9yIHRoZSBtYWluIHNjcmVlbiAoaW5kZXguaHRtbCkgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlZ2lzdGVyQ2hhbm5lbEhhbmRsZXJzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNoYW5uZWwub24oJ1BJTkcnLCAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgUkFHLmNoYW5uZWwuc2VuZCgnUE9ORycsIHsgc3RhdGVKc29uOiBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBSQUcuY2hhbm5lbC5vbignTE9BRF9TVEVQJywgKG1zZzogYW55KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKG1zZy5zdGF0ZUpzb24pXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIFJBRy5sb2FkKG1zZy5zdGF0ZUpzb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFRoZSBkYXNoYm9hcmQgdGFiIG93bnMgcGxheWJhY2sgKGF1ZGlvICsgcnVubmVyKTsgdGhlIGVkaXRvciBvbmx5XHJcbiAgICAgICAgLy8gbWlycm9ycyB0aGUgdmlzaWJsZSB0ZXh0LCBzbyB0aGUgdm9pY2UgaXMgbmV2ZXIgZG91YmxlZC5cclxuICAgICAgICBSQUcuY2hhbm5lbC5vbignUExBWV9TSU5HTEVfU1RFUCcsIChtc2c6IGFueSkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy5taXJyb3JTdGVwKG1zZyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIFJBRy5jaGFubmVsLm9uKCdQTEFZX1NDRU5BUklPX1NURVAnLCAobXNnOiBhbnkpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBSQUcubWlycm9yU3RlcChtc2cpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBSQUcuY2hhbm5lbC5vbignV0FJVF9DT1VOVERPV04nLCAobXNnOiBhbnkpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAoIVJBRy52aWV3cykgcmV0dXJuO1xyXG4gICAgICAgICAgICBsZXQgc2VjcyA9IChtc2cgJiYgbXNnLnJlbWFpbmluZ1NlY29uZHMgIT09IHVuZGVmaW5lZCkgPyBtc2cucmVtYWluaW5nU2Vjb25kcyA6IChtc2cgJiYgbXNnLnJlbWFpbmluZyk7XHJcbiAgICAgICAgICAgIGlmIChzZWNzID09PSB1bmRlZmluZWQpIHJldHVybjtcclxuICAgICAgICAgICAgLy8gc2V0U29mdDogc3dhcCB0aGUgdGV4dCBpbiBwbGFjZSBzbyB0aGUgdGlja3MgZG9uJ3QgcmVzdGFydCB0aGUgc2Nyb2xsIGV2ZXJ5IHNlY29uZFxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXRTb2Z0KGBXYWl0aW5nICR7c2Vjc31zLi4uYCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIFJBRy5jaGFubmVsLm9uKCdTVE9QX1BMQVlCQUNLJywgKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChSQUcudmlld3MpXHJcbiAgICAgICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0lkbGUnLCBmYWxzZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIFJBRy5jaGFubmVsLm9uKCdDQVBUVVJFX1NURVBfUkVRVUVTVCcsIChtc2c6IGFueSkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLnNlbmQoJ0NBUFRVUkVEX1NURVBfREFUQScsIHsgbm9uY2U6IG1zZyA/IG1zZy5ub25jZSA6IHVuZGVmaW5lZCwgc3RhdGVKc29uOiBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpIH0pO1xyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0NhcHR1cmVkIHN0ZXAgZm9yIERhc2hib2FyZCBzY2VuYXJpbycpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBOb3RpZnkgZXh0ZXJuYWwgbGlzdGVuZXJzIChkYXNoYm9hcmQpIHRoYXQgdGhlIGN1cnJlbnQgc3RhdGUgaW4gZWRpdG9yIGNoYW5nZWQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbm90aWZ5U3RhdGVDaGFuZ2VkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKFJBRy5jaGFubmVsICYmIFJBRy5zdGF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy5jaGFubmVsLnNlbmQoJ1NUQVRFX0NIQU5HRUQnLCB7IHN0YXRlSnNvbjogSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKSB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdlbmVyYXRlcyBhIG5ldyByYW5kb20gcGhyYXNlIGFuZCBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IG5ldyBTdGF0ZSgpO1xyXG4gICAgICAgIFJBRy5zdGF0ZS5nZW5EZWZhdWx0U3RhdGUoKTtcclxuICAgICAgICBpZiAoUkFHLnZpZXdzICYmIFJBRy52aWV3cy5lZGl0b3IpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmdlbmVyYXRlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFJBRy5ub3RpZnlTdGF0ZUNoYW5nZWQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogTG9hZHMgc3RhdGUgZnJvbSBnaXZlbiBKU09OICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWQoanNvbjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBPYmplY3QuYXNzaWduKCBuZXcgU3RhdGUoKSwgSlNPTi5wYXJzZShqc29uKSApIGFzIFN0YXRlO1xyXG4gICAgICAgIGlmIChSQUcudmlld3MgJiYgUkFHLnZpZXdzLmVkaXRvcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuZ2VuZXJhdGUoKTtcclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KEwuU1RBVEVfRlJPTV9TVE9SQUdFKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgUkFHLm5vdGlmeVN0YXRlQ2hhbmdlZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHbG9iYWwgZXJyb3IgaGFuZGxlcjsgdGhyb3dzIHVwIGEgYmlnIHJlZCBwYW5pYyBzY3JlZW4gb24gdW5jYXVnaHQgZXJyb3IgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHBhbmljKGVycm9yOiBzdHJpbmcgfCBFdmVudCA9IFwiVW5rbm93biBlcnJvclwiKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBtc2cgPSAnPGRpdiBpZD1cInBhbmljU2NyZWVuXCIgY2xhc3M9XCJ3YXJuaW5nU2NyZWVuXCI+JyAgICAgICAgICArXHJcbiAgICAgICAgICAgICAgICAgICc8aDE+XCJXZSBhcmUgc29ycnkgdG8gYW5ub3VuY2UgdGhhdC4uLlwiPC9oMT4nICAgICAgICAgICArXHJcbiAgICAgICAgICAgICAgICAgIGA8cD5SQUcgaGFzIGNyYXNoZWQgYmVjYXVzZTogPGNvZGU+JHtlcnJvcn08L2NvZGU+PC9wPmAgK1xyXG4gICAgICAgICAgICAgICAgICBgPHA+UGxlYXNlIG9wZW4gdGhlIGNvbnNvbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24uPC9wPmAgICtcclxuICAgICAgICAgICAgICAgICAgJzwvZGl2Pic7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5uZXJIVE1MID0gbXNnO1xyXG4gICAgfVxyXG59XHJcbiIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSB6enotY3JlYXRvciwgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEaXNwb3NhYmxlIGNsYXNzIHRoYXQgaG9sZHMgc3RhdGUgZm9yIHRoZSBjdXJyZW50IHNjaGVkdWxlLCB0cmFpbiwgZXRjLiAqL1xyXG5jbGFzcyBTdGF0ZVxyXG57XHJcbiAgICAvKiogU3RhdGUgb2YgY29sbGFwc2libGUgZWxlbWVudHMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGNvbGxhcHNlZC4gKi9cclxuICAgIHByaXZhdGUgX2NvbGxhcHNpYmxlcyA6IERpY3Rpb25hcnk8Ym9vbGVhbj4gID0ge307XHJcbiAgICAvKiogQ3VycmVudCBjb2FjaCBsZXR0ZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGxldHRlci4gKi9cclxuICAgIHByaXZhdGUgX2NvYWNoZXMgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBpbnRlZ2VyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBpbnRlZ2VyLiAqL1xyXG4gICAgcHJpdmF0ZSBfaW50ZWdlcnMgICAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHBocmFzZXNldCBwaHJhc2UgY2hvaWNlcy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgaW5kZXguICovXHJcbiAgICBwcml2YXRlIF9waHJhc2VzZXRzICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc2VydmljZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc2VydmljZS4gKi9cclxuICAgIHByaXZhdGUgX3NlcnZpY2VzICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzdGF0aW9uIGNvZGUuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9ucyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBsaXN0IGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBhcnJheSBvZiBjb2Rlcy4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25MaXN0cyA6IERpY3Rpb25hcnk8c3RyaW5nW10+ID0ge307XHJcbiAgICAvKiogQ3VycmVudCB0aW1lIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyB0aW1lLiAqL1xyXG4gICAgcHJpdmF0ZSBfdGltZXMgICAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuXHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBleGN1c2UgKi9cclxuICAgIHByaXZhdGUgX2V4Y3VzZT8gICA6IHN0cmluZztcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIHBsYXRmb3JtICovXHJcbiAgICBwcml2YXRlIF9wbGF0Zm9ybT8gOiBQbGF0Zm9ybTtcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIG5hbWVkIHRyYWluICovXHJcbiAgICBwcml2YXRlIF9uYW1lZD8gICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGNvYWNoIGxldHRlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lIGZyb20gQSB0byBaLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgbGV0dGVyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29hY2goY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2FjaGVzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gUmFuZG9tLmFycmF5KEwuTEVUVEVSUyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29hY2ggbGV0dGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29hY2ggVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2FjaChjb250ZXh0OiBzdHJpbmcsIGNvYWNoOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBjb2FjaDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBiZXR3ZWVuIDAgYW5kIDEwMCBvZiBjaG9vc2luZyB0cnVlLCBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBjaGFuY2U6IG51bWJlcikgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSAhUmFuZG9tLmJvb2woY2hhbmNlKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29sbGFwc2libGUncyBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVmFsdWUgdG8gc2V0LCB3aGVyZSB0cnVlIGlzIFwiY29sbGFwc2VkXCJcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvbGxhcHNlZChyZWY6IHN0cmluZywgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gc3RhdGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGludGVnZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5faW50ZWdlcnNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMCwgbWF4ID0gMDtcclxuXHJcbiAgICAgICAgc3dpdGNoKGNvbnRleHQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29hY2hlc1wiOiAgICAgICBtaW4gPSAxOyBtYXggPSAxMDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJkZWxheWVkXCI6ICAgICAgIG1pbiA9IDU7IG1heCA9IDYwOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImZyb250X2NvYWNoZXNcIjogbWluID0gMjsgbWF4ID0gNTsgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicmVhcl9jb2FjaGVzXCI6ICBtaW4gPSAyOyBtYXggPSA1OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYW4gaW50ZWdlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEludGVnZXIoY29udGV4dDogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBwaHJhc2Ugb2YgYSBwaHJhc2VzZXQsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBwaHJhc2VzZXQncyBwaHJhc2Ugb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldElkeChyZWY6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG4gICAgICAgIGxldCBpZHggICAgICAgPSB0aGlzLl9waHJhc2VzZXRzW3JlZl07XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGludHJvZHVjZSBhbiBhc3NlcnRzIHV0aWwsIGFuZCBzdGFydCB1c2luZyB0aGVtIGFsbCBvdmVyXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlNUQVRFX0JBRF9QSFJBU0VTRVQocmVmKSApO1xyXG5cclxuICAgICAgICAvLyBWZXJpZnkgaW5kZXggaXMgdmFsaWQsIGVsc2UgcmVqZWN0IGFuZCBwaWNrIHJhbmRvbVxyXG4gICAgICAgIGlmIChpZHggPT09IHVuZGVmaW5lZCB8fCBwaHJhc2VzZXQuY2hpbGRyZW5baWR4XSA9PT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBSYW5kb20uaW50KDAsIHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGggLSAxKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNob3NlbiBpbmRleCBmb3IgYSBwaHJhc2VzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBwaHJhc2VzZXQgaW5kZXggb2ZcclxuICAgICAqIEBwYXJhbSBpZHggSW5kZXggdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcsIGlkeDogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBpZHg7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHNlcnZpY2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc2VydmljZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU2VydmljZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzZXJ2aWNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzZXJ2aWNlIGZvclxyXG4gICAgICogQHBhcmFtIHNlcnZpY2UgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZywgc2VydmljZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IHNlcnZpY2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHN0YXRpb24gY29kZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzdGF0aW9uIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBmb3JcclxuICAgICAqIEBwYXJhbSBjb2RlIFN0YXRpb24gY29kZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb24oY29udGV4dDogc3RyaW5nLCBjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gY29kZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gbGlzdCBvZiBzdGF0aW9uIGNvZGVzLCBvciByYW5kb21seSBnZW5lcmF0ZXMgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBsaXN0IGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbkxpc3QoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgICAgIGVsc2UgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmcnKTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDEsIG1heCA9IDE2O1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NhbGxpbmdfc3BsaXQnOiBtaW4gPSAyOyBtYXggPSAxNjsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NoYW5nZXMnOiAgICAgICBtaW4gPSAxOyBtYXggPSA0OyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ25vdF9zdG9wcGluZyc6ICBtaW4gPSAxOyBtYXggPSA4OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcyhtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBsaXN0IG9mIHN0YXRpb24gY29kZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBsaXN0IGZvclxyXG4gICAgICogQHBhcmFtIGNvZGVzIFN0YXRpb24gY29kZXMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcsIGNvZGVzOiBzdHJpbmdbXSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdID0gY29kZXM7XHJcblxyXG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnY2FsbGluZ19maXJzdCcpXHJcbiAgICAgICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1snY2FsbGluZyddID0gY29kZXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHRpbWVcclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHRpbWUgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRUaW1lKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fdGltZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IFN0cmluZ3MuZnJvbVRpbWUoIFJhbmRvbS5pbnQoMCwgMjMpLCBSYW5kb20uaW50KDAsIDU5KSApO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl90aW1lc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSB0aW1lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSB0aW1lIGZvclxyXG4gICAgICogQHBhcmFtIHRpbWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRUaW1lKGNvbnRleHQ6IHN0cmluZywgdGltZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IHRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBleGN1c2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBleGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9leGN1c2UpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9leGN1c2U7XHJcblxyXG4gICAgICAgIHRoaXMuX2V4Y3VzZSA9IFJBRy5kYXRhYmFzZS5waWNrRXhjdXNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBzZXQgZXhjdXNlKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBwbGF0Zm9ybSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IHBsYXRmb3JtKCkgOiBQbGF0Zm9ybVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9wbGF0Zm9ybSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXRmb3JtO1xyXG5cclxuICAgICAgICBsZXQgcGxhdGZvcm0gOiBQbGF0Zm9ybSA9IFsnJywgJyddO1xyXG5cclxuICAgICAgICAvLyBPbmx5IDIlIGNoYW5jZSBmb3IgcGxhdGZvcm0gMCwgc2luY2UgaXQncyByYXJlXHJcbiAgICAgICAgcGxhdGZvcm1bMF0gPSBSYW5kb20uYm9vbCg5OClcclxuICAgICAgICAgICAgPyBSYW5kb20uaW50KDEsIDI2KS50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogJzAnO1xyXG5cclxuICAgICAgICAvLyBNYWdpYyB2YWx1ZXNcclxuICAgICAgICBpZiAocGxhdGZvcm1bMF0gPT09ICc5JylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgyNSkgPyAnwr4nIDogJyc7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMTAlIGNoYW5jZSBmb3IgcGxhdGZvcm0gbGV0dGVyLCBzaW5jZSBpdCdzIHVuY29tbW9uXHJcbiAgICAgICAgaWYgKHBsYXRmb3JtWzFdID09PSAnJylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgxMClcclxuICAgICAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCdBQkMnKVxyXG4gICAgICAgICAgICAgICAgOiAnJztcclxuXHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSBwbGF0Zm9ybTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzZXQgcGxhdGZvcm0odmFsdWU6IFBsYXRmb3JtKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBuYW1lZCB0cmFpbiwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IG5hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fbmFtZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuXHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSBSQUcuZGF0YWJhc2UucGlja05hbWVkKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc2V0IG5hbWVkKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgdGhlIHN0YXRlIGluIGEgcGFydGljdWxhciB3YXksIHNvIHRoYXQgaXQgbWFrZXMgc29tZSByZWFsLXdvcmxkIHNlbnNlLlxyXG4gICAgICogVG8gZG8gc28sIHdlIGhhdmUgdG8gZ2VuZXJhdGUgZGF0YSBpbiBhIHBhcnRpY3VsYXIgb3JkZXIsIGFuZCBtYWtlIHN1cmUgdG8gYXZvaWRcclxuICAgICAqIGR1cGxpY2F0ZXMgaW4gaW5hcHByb3ByaWF0ZSBwbGFjZXMgYW5kIGNvbnRleHRzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2VuRGVmYXVsdFN0YXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RlcCAxLiBQcmVwb3B1bGF0ZSBzdGF0aW9uIGxpc3RzXHJcblxyXG4gICAgICAgIGxldCBzbENhbGxpbmcgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDE2KTtcclxuICAgICAgICBsZXQgc2xDYWxsU3BsaXQgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygyLCAxNiwgc2xDYWxsaW5nKTtcclxuICAgICAgICBsZXQgYWxsQ2FsbGluZyAgPSBbLi4uc2xDYWxsaW5nLCAuLi5zbENhbGxTcGxpdF07XHJcblxyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgZm91bmQgdmlhIGEgc3BlY2lmaWMgY2FsbGluZyBwb2ludFxyXG4gICAgICAgIGxldCBzbENoYW5nZXMgICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgNCwgYWxsQ2FsbGluZyk7XHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyB0aGF0IHRoaXMgdHJhaW4gdXN1YWxseSBzZXJ2ZXMsIGJ1dCBjdXJyZW50bHkgaXNuJ3RcclxuICAgICAgICBsZXQgc2xOb3RTdG9wcGluZyA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDgsXHJcbiAgICAgICAgICAgIFsuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXNdXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGFrZSBhIHJhbmRvbSBzbGljZSBmcm9tIHRoZSBjYWxsaW5nIGxpc3QsIHRvIGlkZW50aWZ5IGFzIHJlcXVlc3Qgc3RvcHNcclxuICAgICAgICBsZXQgcmVxQ291bnQgICA9IFJhbmRvbS5pbnQoMSwgc2xDYWxsaW5nLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGxldCBzbFJlcXVlc3RzID0gc2xDYWxsaW5nLnNsaWNlKDAsIHJlcUNvdW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZycsICAgICAgIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZ19zcGxpdCcsIHNsQ2FsbFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjaGFuZ2VzJywgICAgICAgc2xDaGFuZ2VzKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdub3Rfc3RvcHBpbmcnLCAgc2xOb3RTdG9wcGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgncmVxdWVzdCcsICAgICAgIHNsUmVxdWVzdHMpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDIuIFByZXBvcHVsYXRlIHN0YXRpb25zXHJcblxyXG4gICAgICAgIC8vIEFueSBzdGF0aW9uIG1heSBiZSBibGFtZWQgZm9yIGFuIGV4Y3VzZSwgZXZlbiBvbmVzIGFscmVhZHkgcGlja2VkXHJcbiAgICAgICAgbGV0IHN0RXhjdXNlICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiBpcyBmaW5hbCBjYWxsIG9mIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0ICAgID0gc2xDYWxsaW5nW3NsQ2FsbGluZy5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBWaWEgaXMgYSBjYWxsIGJlZm9yZSB0aGUgZGVzdGluYXRpb24sIG9yIG9uZSBpbiB0aGUgc3BsaXQgbGlzdCBpZiB0b28gc21hbGxcclxuICAgICAgICBsZXQgc3RWaWEgICAgID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBEaXR0byBmb3IgcGlja2luZyBhIHJhbmRvbSBjYWxsaW5nIHN0YXRpb24gYXMgYSBzaW5nbGUgcmVxdWVzdCBvciBjaGFuZ2Ugc3RvcFxyXG4gICAgICAgIGxldCBzdENhbGxpbmcgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG5cclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiAobGFzdCBjYWxsKSBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3RTcGxpdCA9IHNsQ2FsbFNwbGl0W3NsQ2FsbFNwbGl0Lmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFJhbmRvbSBub24tZGVzdGluYXRpb24gc3RvcCBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdFZpYVNwbGl0ICA9IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gV2hlcmUgdGhlIHRyYWluIGNvbWVzIGZyb20sIHNvIGNhbid0IGJlIG9uIGFueSBsaXN0cyBvciBwcmlvciBzdGF0aW9uc1xyXG4gICAgICAgIGxldCBzdFNvdXJjZSAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoW1xyXG4gICAgICAgICAgICAuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXMsIC4uLnNsTm90U3RvcHBpbmcsIC4uLnNsUmVxdWVzdHMsXHJcbiAgICAgICAgICAgIHN0Q2FsbGluZywgc3REZXN0LCBzdFZpYSwgc3REZXN0U3BsaXQsIHN0VmlhU3BsaXRcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdjYWxsaW5nJywgICAgICAgICAgIHN0Q2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbicsICAgICAgIHN0RGVzdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbl9zcGxpdCcsIHN0RGVzdFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2V4Y3VzZScsICAgICAgICAgICAgc3RFeGN1c2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignc291cmNlJywgICAgICAgICAgICBzdFNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWEnLCAgICAgICAgICAgICAgIHN0VmlhKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYV9zcGxpdCcsICAgICAgICAgc3RWaWFTcGxpdCk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMy4gUHJlcG9wdWxhdGUgY29hY2ggbnVtYmVyc1xyXG5cclxuICAgICAgICBsZXQgaW50Q29hY2hlcyA9IHRoaXMuZ2V0SW50ZWdlcignY29hY2hlcycpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGp1c3Qgc3BsaXQgdGhlIG51bWJlciBkb3duIHRoZSBtaWRkbGUgaW5zdGVhZC5cclxuICAgICAgICAvLyBFbHNlLCBmcm9udCBhbmQgcmVhciBjb2FjaGVzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGludEZyb250Q29hY2hlcyA9IChpbnRDb2FjaGVzIC8gMikgfCAwO1xyXG4gICAgICAgICAgICBsZXQgaW50UmVhckNvYWNoZXMgID0gaW50Q29hY2hlcyAtIGludEZyb250Q29hY2hlcztcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcignZnJvbnRfY29hY2hlcycsIGludEZyb250Q29hY2hlcyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcigncmVhcl9jb2FjaGVzJywgaW50UmVhckNvYWNoZXMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBhc3NpZ24gY29hY2ggbGV0dGVycyBmb3IgY29udGV4dHMuXHJcbiAgICAgICAgLy8gRWxzZSwgbGV0dGVycyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsZXR0ZXJzID0gTC5MRVRURVJTLnNsaWNlKDAsIGludENvYWNoZXMpLnNwbGl0KCcnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdmaXJzdCcsICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3Nob3AnLCAgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQxJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDInLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNC4gUHJlcG9wdWxhdGUgc2VydmljZXNcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBzZXJ2aWNlLCBwaWNrIG9uZSB0byBiZSB0aGUgXCJtYWluXCIgYW5kIG9uZSB0byBiZSB0aGVcclxuICAgICAgICAvLyBcImFsdGVybmF0ZVwiLCBlbHNlIHRoZSBvbmUgc2VydmljZSB3aWxsIGJlIHVzZWQgZm9yIGJvdGggKHdpdGhvdXQgbWFraW5nIHNlbnNlKS5cclxuICAgICAgICBpZiAoUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmxlbmd0aCA+IDEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgc2VydmljZXMgPSBSQUcuZGF0YWJhc2Uuc2VydmljZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ3Byb3ZpZGVyJywgICAgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdhbHRlcm5hdGl2ZScsIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNS4gUHJlcG9wdWxhdGUgdGltZXNcclxuICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTIxNDc1M1xyXG5cclxuICAgICAgICAvLyBUaGUgYWx0ZXJuYXRpdmUgdGltZSBpcyBmb3IgYSB0cmFpbiB0aGF0J3MgbGF0ZXIgdGhhbiB0aGUgbWFpbiB0cmFpblxyXG4gICAgICAgIGxldCB0aW1lICAgID0gbmV3IERhdGUoIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgUmFuZG9tLmludCgwLCA1OSkgKiA2MDAwMCk7XHJcbiAgICAgICAgbGV0IHRpbWVBbHQgPSBuZXcgRGF0ZSggdGltZS5nZXRUaW1lKCkgICAgICAgKyBSYW5kb20uaW50KDAsIDMwKSAqIDYwMDAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnbWFpbicsICAgICAgICBTdHJpbmdzLmZyb21UaW1lKHRpbWUpICAgICk7XHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnYWx0ZXJuYXRpdmUnLCBTdHJpbmdzLmZyb21UaW1lKHRpbWVBbHQpICk7XHJcbiAgICB9XHJcbn0iXX0=