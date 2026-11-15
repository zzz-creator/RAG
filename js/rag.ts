/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */

/** Main class of the entire Rail Announcements Generator application */
class RAG
{
    /** Gets the configuration container */
    public static config    : Config;
    /** Gets the database manager, which holds phrase, station and train data */
    public static database  : Database;
    /** Gets the phrase manager, which generates HTML phrases from XML */
    public static phraser   : Phraser;
    /** Gets the speech engine */
    public static speech    : Speech;
    /** Gets the current train and station state */
    public static state     : State;
    /** Gets the view controller, which manages UI interaction */
    public static views     : Views;
    /** Gets the scenario runner, which chains announcements into a sequence */
    public static scenario  : Scenario;
    /** Gets the scenario dashboard controller */
    public static dashboard : ScenarioDashboard;
    /** Cross-window messaging channel */
    public static channel   : ScenarioChannel;

    /**
     * Entry point for RAG, to be called from Javascript.
     *
     * @param dataRefs Configuration object, with rail data to use
     */
    public static main(dataRefs: DataRefs) : void
    {
        window.onerror              = error => RAG.panic(error);
        window.onunhandledrejection = error => RAG.panic(error);

        I18n.init();

        RAG.config    = new Config(true);
        RAG.database  = new Database(dataRefs);
        RAG.phraser   = new Phraser();
        RAG.speech    = new Speech();
        RAG.scenario  = new Scenario();
        RAG.views     = new Views();
        RAG.dashboard = new ScenarioDashboard();
        RAG.channel   = new ScenarioChannel();

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
        else
        {
            RAG.applyEditRequest();
            RAG.bindPlaybackGate();
        }
    }

    /** True when this page was opened as the dashboard (controller) view */
    private static isDashboardRole() : boolean
    {
        let search = window.location.search || '';
        let hash   = window.location.hash   || '';
        return search.indexOf('dashboard=1') !== -1 || hash.indexOf('dashboard') !== -1;
    }

    /**
     * Editor role: if the dashboard asked to edit a specific step, load that
     * step's announcement into the editor and point "Update Step" at it.
     */
    private static applyEditRequest() : void
    {
        if (window.localStorage.getItem('rag.editRequest') !== '1')
            return;

        window.localStorage.removeItem('rag.editRequest');

        let id     = window.localStorage.getItem('rag.currentScenarioId');
        let idxStr = window.localStorage.getItem('rag.selectedStepIndex');
        if (!id || idxStr === null)
            return;

        let idx = parseInt(idxStr);
        let raw = window.localStorage.getItem('rag.scenarios');
        if (!raw)
            return;

        let scenarios = JSON.parse(raw) as Array<{ id: string; name: string; steps: Array<{ stateJson?: string }> }>;
        let sc   = scenarios.find(s => s.id === id);
        let step = (sc && sc.steps[idx]) ? sc.steps[idx] : null;
        if (!step || !step.stateJson)
            return;

        RAG.load(step.stateJson);
        RAG.views.marquee.set('Editing step ' + (idx + 1) + ' of "' + sc!.name + '". Make your changes, then click "Update Step" to save them back.');
    }

    /**
     * Editor role: pause editing while a scenario is playing in another tab.
     * The dashboard tab sets rag.playbackActive; we react to it live.
     */
    private static bindPlaybackGate() : void
    {
        let apply = (active: boolean) =>
        {
            if (!RAG.views)
                return;

            RAG.views.main.style.pointerEvents = active ? 'none' : '';
            let toolbar = document.getElementById('toolbar');
            if (toolbar)
                toolbar.style.pointerEvents = active ? 'none' : '';
        };

        let check = () =>
        {
            let active = window.localStorage.getItem('rag.playbackActive') === '1';
            if (active)
            {
                // The dashboard tab refreshes this heartbeat while it is
                // alive; a stale stamp means it closed (or crashed) mid-
                // playback, so release the lock instead of holding the
                // editor hostage forever.
                let since = parseInt(window.localStorage.getItem('rag.playbackSince') || '0', 10);
                if (Date.now() - since > 15 * 1000)
                {
                    window.localStorage.removeItem('rag.playbackActive');
                    window.localStorage.removeItem('rag.playbackSince');
                    active = false;
                }
            }
            apply(active);
        };

        check();

        window.addEventListener('storage', (e: StorageEvent) =>
        {
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
    private static mirrorStep(msg: any) : void
    {
        if (!RAG.views) return;
        let text = (msg && msg.text) ? String(msg.text) : '';
        if (text)
            RAG.views.marquee.set(text);
    }

    /** Register channel handlers for the main screen (index.html) */
    private static registerChannelHandlers() : void
    {
        RAG.channel.on('PING', () =>
        {
            RAG.channel.send('PONG', { stateJson: JSON.stringify(RAG.state) });
        });

        RAG.channel.on('LOAD_STEP', (msg: any) =>
        {
            if (msg.stateJson)
            {
                RAG.load(msg.stateJson);
            }
        });

        // The dashboard tab owns playback (audio + runner); the editor only
        // mirrors the visible text, so the voice is never doubled.
        RAG.channel.on('PLAY_SINGLE_STEP', (msg: any) =>
        {
            RAG.mirrorStep(msg);
        });

        RAG.channel.on('PLAY_SCENARIO_STEP', (msg: any) =>
        {
            RAG.mirrorStep(msg);
        });

        RAG.channel.on('WAIT_COUNTDOWN', (msg: any) =>
        {
            if (!RAG.views) return;
            let secs = (msg && msg.remainingSeconds !== undefined) ? msg.remainingSeconds : (msg && msg.remaining);
            if (secs === undefined) return;
            // setSoft: swap the text in place so the ticks don't restart the scroll every second
            RAG.views.marquee.setSoft(`Waiting ${secs}s...`);
        });

        RAG.channel.on('STOP_PLAYBACK', () =>
        {
            if (RAG.views)
                RAG.views.marquee.set('Idle', false);
        });

        RAG.channel.on('CAPTURE_STEP_REQUEST', (msg: any) =>
        {
            RAG.channel.send('CAPTURED_STEP_DATA', { nonce: msg ? msg.nonce : undefined, stateJson: JSON.stringify(RAG.state) });
            RAG.views.marquee.set('Captured step for Dashboard scenario');
        });
    }

    /** Notify external listeners (dashboard) that the current state in editor changed */
    public static notifyStateChanged() : void
    {
        if (RAG.channel && RAG.state)
        {
            RAG.channel.send('STATE_CHANGED', { stateJson: JSON.stringify(RAG.state) });
        }
    }

    /** Generates a new random phrase and state */
    public static generate() : void
    {
        RAG.state = new State();
        RAG.state.genDefaultState();
        if (RAG.views && RAG.views.editor)
        {
            RAG.views.editor.generate();
        }
        RAG.notifyStateChanged();
    }

    /** Loads state from given JSON */
    public static load(json: string) : void
    {
        RAG.state = Object.assign( new State(), JSON.parse(json) ) as State;
        if (RAG.views && RAG.views.editor)
        {
            RAG.views.editor.generate();
            RAG.views.marquee.set(L.STATE_FROM_STORAGE);
        }
        RAG.notifyStateChanged();
    }

    /** Global error handler; throws up a big red panic screen on uncaught error */
    private static panic(error: string | Event = "Unknown error")
    {
        let msg = '<div id="panicScreen" class="warningScreen">'          +
                  '<h1>"We are sorry to announce that..."</h1>'           +
                  `<p>RAG has crashed because: <code>${error}</code></p>` +
                  `<p>Please open the console for more information.</p>`  +
                  '</div>';

        document.body.innerHTML = msg;
    }
}
