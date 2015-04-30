/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.


 @author: Tom Clement (tjclement)
 @license MIT
 @copyright Bizboard, 2015

 */

'use strict';

import ObjectHelper from '../../utils/objectHelper';
import Snapshot from './snapshot';
import _ from 'lodash';

export default
class PrioritisedObject {

    get id() { return this._id; }
    set id(value) { }

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
        /**** Callbacks ****/
        this._valueChangedCallback = null;

        /**** Private properties ****/
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

        if(dataSnapshot){
            this._buildFromSnapshot(dataSnapshot);
        } else {
            this._buildFromDataSource(dataSource);
        }
    }

    /**
     *  Deletes the current object from the dataSource, and clears itself to free memory.
     */
    delete() {
        this.removeValueChangedCallback()
        if (this._dataSource.inheritable)
            this._dataSource.remove(this);
        else this._dataSource.remove();
        delete this;
    }

    /**
     * Sets a callback that gets triggered whenever data is updated by
     * the remote dataSource.
     * @param callback
     */
    setValueChangedCallback(callback) {
        this._valueChangedCallback = callback;
        this._dataSource.setValueChangedCallback(this._onDataSourceValue.bind(this));
    }

    /**
     * Remove callback that gets triggered whenever data is updated by
     * the remote dataSource.
     */
    removeValueChangedCallback() {
        this._dataSource.removeValueChangedCallback();
        this._valueChangedCallback = null;
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
        let numChidren = dataSnapshot.numChildren();

        /* For each primitive in the snapshot, define getter/setter.
         * For objects, add them as a PrioritisedObject.
         */
        dataSnapshot.forEach(
            /** @param {Snapshot} child **/
            (child) => {
                let ref = child.ref();
                let key = child.key();
                let val = child.val();

                this._id = key;

                if (typeof val === 'object' && val !== null) {
                    /* If child is an object, put it in its own PrioritisedObject. We're not interested
                     * in updates from this object, since it will have its own change listener */
                    val = new PrioritisedObject(ref, child);
                    ObjectHelper.addPropertyToObject(this, key, val, true, true);
                }
                else {

                    // only map properties that exists on our model
                    if (Object.getOwnPropertyDescriptor(this, key)) {
                        /* If child is a primitive, listen to changes so we can synch with Firebase */
                        ObjectHelper.addPropertyToObject(this, key, val, true, true, this._onSetterTriggered);
                    }
                }
            });
    }

    /**
     * Clones a dataSource (to not disturb any existing callbacks defined on the original) and uses it
     * to get a dataSnapshot which is used in _buildSnapshot to build our object.
     * @param dataSource
     * @private
     */
    _buildFromDataSource(dataSource) {
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
    _onDataSourceValue(dataSnapshot) {

        /* If the new dataSource data is equal to what we have locallly,
         * this is an update triggered by a local change having been pushed
         * to the remote dataSource. We can ignore it.
         */
        if (_.isEqual(this, dataSnapshot)) {
            return;
        }

        /* Make sure we don't trigger pushes to dataSource whilst repopulating with new dataSource data */
        this._isBeingWrittenByDatasource = true;
        this._buildFromSnapshot(dataSnapshot);
        this._isBeingWrittenByDatasource = false;

        /* If an update callback is present, trigger it */
        if (this._valueChangedCallback) {
            this._valueChangedCallback(this);
        }
    }
}
