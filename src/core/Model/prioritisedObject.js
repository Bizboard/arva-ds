/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.


 @author: Tom Clement (tjclement)
 @license MIT
 @copyright Bizboard, 2015

 */

import _                from 'lodash';
import EventEmitter     from 'eventemitter3';
import {ObjectHelper}   from 'arva-utils/ObjectHelper';
import {Snapshot}       from './snapshot';
import {DataSource}     from '../DataSource';

export class PrioritisedObject extends EventEmitter {

    get id() { return this._id; }

    set id(value) { this._id = value; }

    /** Priority (positioning) of the object in the dataSource */
    get priority() {
        return this._priority;
    }

    set priority(value) {
        if (this._priority !== value) {
            this._priority = value;
            this._dataSource.setPriority(value);
        }
    }

    get _inheritable() {
        if (!this._dataSource) return false;
        return this._dataSource.inheritable;
    }

    /**
     *
     * @param {DataSource} dataSource
     * @param {Snapshot} dataSnapshot
     */
    constructor(dataSource, dataSnapshot = null) {
        super();

        /**** Callbacks ****/
        this._valueChangedCallback = null;

        /**** Private properties ****/
        this._id = dataSource ? dataSource.key() : 0;
        this._events = this._events || [];
        this._dataSource = dataSource;
        this._priority = 0; // Priority of this object on remote dataSource
        this._isBeingWrittenByDatasource = false; // Flag to determine when dataSource is updating object

        /* Bind all local methods to the current object instance, so we can refer to "this"
         * in the methods as expected, even when they're called from event handlers.        */
        ObjectHelper.bindAllMethods(this, this);

        /* Hide all private properties (starting with '_') and methods from enumeration,
         * so when you do for( in ), only actual data properties show up. */
        ObjectHelper.hideMethodsAndPrivatePropertiesFromObject(this);

        /* Hide the id field from enumeration, so we don't save it to the dataSource. */
        ObjectHelper.hidePropertyFromObject(this, 'id');

        /* Hide the priority field from enumeration, so we don't save it to the dataSource. */
        ObjectHelper.hidePropertyFromObject(this, 'priority');

        if (dataSnapshot) {
            this._buildFromSnapshot(dataSnapshot);
        } else {
            this._buildFromDataSource(dataSource);
        }
    }

    /**
     *  Deletes the current object from the dataSource, and clears itself to free memory.
     */
    remove() {
        this.off();
        if (this._dataSource.inheritable)
            this._dataSource.remove(this);
        else this._dataSource.remove();
        delete this;
    }


    once(event, fn, context = this) {
        return this.on(event, function () {
            fn.call(context, arguments);
            this.off(event, fn, context);
        }, this);
    }

    onModelUpdated(snapshot) {
        let toCompare = ObjectHelper.getEnumerableProperties(this);
        let newData = snapshot.val();

        return !_.isEqual(toCompare, newData);
    }


    on(event, fn, context = this) {

        switch (event) {
            case 'ready':
                /* If we're already ready, fire immediately */
                if (this._dataSource && this._dataSource.ready) { fn.call(context, this); }
                break;
            case 'value':
                this._dataSource.setValueChangedCallback(this._onChildValue);
                break;
            case 'added':
                this._dataSource.setChildAddedCallback(this._onChildAdded);
                break;
            case 'moved':
                this._dataSource.setChildMovedCallback(this._onChildMoved);
                break;
            case 'removed':
                this._dataSource.setChildRemovedCallback(this._onChildRemoved);
                break;
        }

        super.on(event, fn, context);
    }

    off(event, fn, context) {
        if (event && (fn || context)) {
            super.removeListener(event, fn, context);
        } else {
            super.removeAllListeners(event);
        }

        /* If we have no more listeners of this event type, remove dataSource callback. */
        if (!this.listeners(event, true)) {
            switch (event) {
                case 'ready':
                    break;
                case 'value':
                    this._dataSource.removeValueChangedCallback();
                    break;
                case 'added':
                    this._dataSource.removeChildAddedCallback();
                    break;
                case 'moved':
                    this._dataSource.removeChildMovedCallback();
                    break;
                case 'removed':
                    this._dataSource.removeChildRemovedCallback();
                    break;
            }
        }
    }

    /**
     * Recursively builds getter/setter based properties on current PrioritisedObject from
     * a given dataSnapshot. If an object value is detected, the object itself gets built as
     * another PrioritisedObject and set to the current PrioritisedObject as a property.
     * @param {Snapshot} dataSnapshot
     * @private
     */
    _buildFromSnapshot(dataSnapshot) {

        /* Set root object _priority */
        this._priority = dataSnapshot.getPriority();
        let numChildren = dataSnapshot.numChildren(), currentChild = 1;

        if(!this._id) {
            this._id = dataSnapshot.key();
        }

        /* If there is no data at this point yet, fire a ready event */
        if (numChildren === 0) {
            this._dataSource.ready = true;
            this.emit('ready');
        }

        let data = dataSnapshot.val();

        for (let key in data) {

            /* Only map properties that exists on our model */
            if (Object.getOwnPropertyDescriptor(this, key)) {
                /* If child is a primitive, listen to changes so we can synch with Firebase */
                ObjectHelper.addPropertyToObject(this, key, data[key], true, true, this._onSetterTriggered);
            }

        }

        this._dataSource.ready = true;
        this.emit('ready');
    }

    /**
     * Clones a dataSource (to not disturb any existing callbacks defined on the original) and uses it
     * to get a dataSnapshot which is used in _buildSnapshot to build our object.
     * @param dataSource
     * @private
     */
    _buildFromDataSource(dataSource) {
        if (!dataSource) return;

        let path = dataSource.path();
        let DataSource = Object.getPrototypeOf(dataSource).constructor;
        let newSource = new DataSource(path);
        newSource.setValueChangedCallback((dataSnapshot) => {
            newSource.removeValueChangedCallback();
            this._buildFromSnapshot(dataSnapshot);
        });
    }

    /**
     * Gets called whenever a property value is set on this object.
     * This can happen when local code modifies it, or when the dataSource updates it.
     * We only propagate changes to the dataSource if the change was local.
     * @private
     */
    _onSetterTriggered() {
        if (!this._isBeingWrittenByDatasource) {
            this._dataSource.setWithPriority(ObjectHelper.getEnumerableProperties(this), this._priority);
        }
    }

    /**
     * Gets called whenever the current PrioritisedObject is changed by the dataSource.
     * @param dataSnapshot
     * @private
     */
    _onChildValue(dataSnapshot, previousSiblingID) {

        /* If the new dataSource data is equal to what we have locallly,
         * this is an update triggered by a local change having been pushed
         * to the remote dataSource. We can ignore it.
         */
        if (_.isEqual(ObjectHelper.getEnumerableProperties(this), dataSnapshot.val())) {
            return;
        }

        /* Make sure we don't trigger pushes to dataSource whilst repopulating with new dataSource data */
        this._isBeingWrittenByDatasource = true;
        this._buildFromSnapshot(dataSnapshot);
        this._isBeingWrittenByDatasource = false;

        this.emit('value', dataSnapshot, previousSiblingID);
    }

    _onChildAdded(dataSnapshot, previousSiblingID) { this.emit('added', dataSnapshot, previousSiblingID); }

    _onChildMoved(dataSnapshot, previousSiblingID) { this.emit('moved', dataSnapshot, previousSiblingID); }

    _onChildRemoved(dataSnapshot, previousSiblingID) { this.emit('removed', dataSnapshot, previousSiblingID); }
}
