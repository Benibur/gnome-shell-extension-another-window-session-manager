'use strict';

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as SessionItemButtons from '../ui/sessionItemButtons.js';


export const SessionItem = GObject.registerClass(
class SessionItem extends PopupMenu.PopupMenuItem {
    
    _init(fileInfo, file, indicator) {
        // Initialize this component, so we can use this.label etc
        super._init("");

        this._indicator = indicator;

        this._available = true;

        this._filepath = file.get_path();
        if(fileInfo != null) {
            this._filename = fileInfo.get_name(); 
            const modification_date_time = fileInfo.get_modification_date_time();
            if (modification_date_time) {
                this._modification_time = modification_date_time.to_local().format('%Y-%m-%d %T');
            } else {
                this._modification_time = '( Unknown )';
                this._available = false;
            }
        } else {
            this._filename = file.get_basename();
            this._modification_time = '( Please save this session before using it )';
            
            this._available = false;
        }

        this.label.set_x_expand(true);
        const escName = GLib.markup_escape_text(this._filename, -1);
        const escMtime = GLib.markup_escape_text(this._modification_time, -1);
        this.label.clutter_text.set_use_markup(true);
        this.label.clutter_text.set_markup(`${escName}\n<small>${escMtime}</small>`);

        this._sessionItemButtons = new SessionItemButtons.SessionItemButtons(this);
        this._sessionItemButtons.addButtons();

    }

    destroy() {
        this._sessionItemButtons.destroy();
        super.destroy();
    }

});

const EmptySessionItem = GObject.registerClass(
class EmptySessionItem extends PopupMenu.PopupMenuItem {
    
    _init() {
        super._init("(Empty, please save open windows first)");
        this.setSensitive(false);
    }

});

