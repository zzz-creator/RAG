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
    /** Role this page booted in ('dashboard' / 'editor'), from the boot script */
    public static bootRole  : string = '';

    /**
     * Entry point for RAG, to be called from Javascript.
     *
     * @param dataRefs Configuration object, with rail data to use
     */
    public static main(dataRefs: DataRefs) : void
    {
        window.onerror              = error => RAG.panic(error);
        window.onunhandledrejection = error => RAG.panic(error);

        RAG.bootRole = dataRefs.bootRole || '';

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
    public static isDashboardRole() : boolean
    {
        return RAG.bootRole === 'dashboard';
    }

    /** True when this page booted in the screen (display) role */
    public static isScreenRole() : boolean
    {
        return RAG.bootRole === 'screen';
    }

    /**
     * Screen role: this page is a marquee-only display. Hide the toolbar and
     * the phrase editor so only the scrolling board is visible; playback is
     * driven over the channel (PLAY_* / WAIT_COUNTDOWN / STOP_PLAYBACK) and
     * never speaks here, so the voice is not doubled.
     */
    private static setupDisplayRole() : void
    {
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
