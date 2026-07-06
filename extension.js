'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as OpenWindowsTracker from './openWindowsTracker.js';

import * as Indicator from './indicator.js';
import * as Autostart from './ui/autostart.js';
import * as Autoclose from './ui/autoclose.js';
import {WindowTilingSupport} from './windowTilingSupport.js';
import * as WindowPicker from './utils/WindowPicker.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Constants from './constants.js';
import * as Log from './utils/log.js';
import * as FileUtils from './utils/fileUtils.js';
import {prefsUtilsInit, prefsUtilsDestroy} from './utils/prefsUtils.js';


let _indicator;
let _autostartServiceProvider;
let _openWindowsTracker;
let _autoclose;
let _windowPickerServiceProvider;

export default class AnotherWindowSessionManagerExtension extends Extension {

    constructor(metadata) {
        super(metadata);
    }

    enable() {
        // settings is needed by the initialization of some utils
        this._settings = this.getSettings('org.gnome.shell.extensions.another-window-session-manager');        

        this.initUtils();

        // Must run BEFORE any auto-save timer can start (i.e. before the
        // indicator builds the session menu). Protects the pre-crash state
        // when GNOME didn't shut down normally.
        this._promoteAutoSaveAfterCrash();

        this._settingsChangedId = this._settings.connect('changed::show-indicator', () => this.showOrHideIndicator());
        this.showOrHideIndicator();
    
        _autostartServiceProvider = new Autostart.AutostartServiceProvider();
        
        WindowTilingSupport.initialize();
    
        _openWindowsTracker = new OpenWindowsTracker.OpenWindowsTracker();
        _autoclose = new Autoclose.Autoclose();
    
        _windowPickerServiceProvider = new WindowPicker.WindowPickerServiceProvider();
        _windowPickerServiceProvider.enable();
    }

    initUtils() {
        prefsUtilsInit(this, this._settings);
        FileUtils.init(this);
    }

    _promoteAutoSaveAfterCrash() {
        const log = new Log.Log();
        try {
            const raw = this._settings.get_string(Constants.PREFS_SETTING_AUTOSAVE_SESSIONS);
            const config = JSON.parse(raw || '{}');
            const enabledNames = Object.entries(config)
                .filter(([, c]) => c && c.enabled)
                .map(([name]) => name);
            if (enabledNames.length === 0) return;

            const getMtime = (path) => {
                if (!GLib.file_test(path, GLib.FileTest.EXISTS)) return null;
                try {
                    const info = Gio.File.new_for_path(path).query_info(
                        'time::modified', Gio.FileQueryInfoFlags.NONE, null);
                    return info.get_attribute_uint64('time::modified');
                } catch (e) {
                    log.error(e, `Cannot stat ${path}`);
                    return null;
                }
            };

            const rcsPath = FileUtils.recently_closed_session_path;
            const rcsMtime = getMtime(rcsPath) ?? 0;

            let winnerPath = null;
            let winnerMtime = rcsMtime;
            let winnerName = null;
            for (const name of enabledNames) {
                const p = GLib.build_filenamev([FileUtils.sessions_path, name]);
                const m = getMtime(p);
                if (m !== null && m > winnerMtime) {
                    winnerPath = p;
                    winnerMtime = m;
                    winnerName = name;
                }
            }
            if (!winnerPath) {
                log.debug('No auto-save session newer than Recently Closed Session — normal shutdown assumed.');
                return;
            }

            log.info(`Crash recovery: auto-save session "${winnerName}" is newer than Recently Closed Session, promoting it.`);

            if (GLib.file_test(rcsPath, GLib.FileTest.EXISTS)) {
                const backupDir = FileUtils.get_sessions_backups_path();
                if (GLib.mkdir_with_parents(backupDir, 0o744) === 0) {
                    const backupPath = GLib.build_filenamev([backupDir,
                        FileUtils.recently_closed_session_name + '.backup-' + Date.now()]);
                    FileUtils.recently_closed_session_file.copy(
                        Gio.File.new_for_path(backupPath),
                        Gio.FileCopyFlags.OVERWRITE, null, null);
                    log.info(`Backed up previous Recently Closed Session to ${backupPath}`);
                } else {
                    log.error(new Error(`Failed to create backup dir ${backupDir}`));
                }
            }

            Gio.File.new_for_path(winnerPath).copy(
                FileUtils.recently_closed_session_file,
                Gio.FileCopyFlags.OVERWRITE, null, null);
            log.info(`Promoted "${winnerName}" -> Recently Closed Session`);
        } catch (e) {
            log.error(e, 'promoteAutoSaveAfterCrash failed');
        }
    }
    
    showOrHideIndicator() {
        if (this._settings.get_boolean('show-indicator')) {
            if (!_indicator) {
                // Remove any stale indicator left over from a previous enable/disable cycle
                // (e.g. after screen lock/unlock) to avoid "Extension point conflict" error
                const existingIndicator = Main.panel.statusArea['Another Window Session Manager'];
                if (existingIndicator) {
                    existingIndicator.destroy();
                }
                _indicator = new Indicator.AwsIndicator();
                Main.panel.addToStatusArea('Another Window Session Manager', _indicator);
            }
        } else {
            this.hideIndicator();
        }
    }
    
    hideIndicator() {
        if (_indicator) {
            _indicator.destroy();
            _indicator = null;
        }
    }
    
    disable() {
    
        this.hideIndicator();
    
        if (_autostartServiceProvider) {
            _autostartServiceProvider.disable();
            _autostartServiceProvider = null;
        }
    
        if (_openWindowsTracker) {
            _openWindowsTracker.destroy();
            _openWindowsTracker = null;
        }
    
        WindowTilingSupport.destroy();
        
        if (_autoclose) {
            _autoclose.destroy();
            _autoclose = null;
        }
    
        Log.Log.destroyDefault();
    
        if (_windowPickerServiceProvider) {
            _windowPickerServiceProvider.destroy();
            _windowPickerServiceProvider = null;
        }

        if (this._settings) {
            if (this._settingsChangedId) {
                this._settings.disconnect(this._settingsChangedId);
                this._settingsChangedId = null;
            }
            this._settings = null;
        }

        prefsUtilsDestroy();
    
    }
    
}
