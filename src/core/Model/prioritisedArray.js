/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.


 @author: Tom Clement (tjclement)
 @license MIT
 @copyright Bizboard, 2015

 */


import {DataSource}         from '../../core/DataSource';
import ObjectHelper         from '../../utils/objectHelper';
import {Context}            from 'arva-context/Context';
import EventEmitter         from 'eventemitter3';


export default
class PrioritisedArray extends Array {

    /* Extending Array does not work fluently yet. The length property always returns 0,
     * regardless of how many entries are in the array. We'll override the length prop to determine
     * the amount of enumerable properties in our PrioritisedArray instead of using the built-in length property.
     */
    get length() {
        return Object.keys(this).length
    }

    set length(value) {
    }

    /**
     *
     * @param {Function} dataType
     * @param {DataSource} dataSource
     * @param {Snapshot} dataSnapshot
     */
    constructor(dataType, dataSource = null, dataSnapshot = null) {
        super();
        /**** Callbacks ****/
        this._valueChangedCallback = null;

        /**** Private properties ****/
        this._dataType = dataType;
        this._dataSource = dataSource;
        this._isBeingReordered = false; /* Flag to determine when we're reordering so we don't listen to move updates */
        this._eventEmitter = new EventEmitter();

        /* Bind all local methods to the current object instance, so we can refer to "this"
         * in the methods as expected, even when they're called from event handlers.        */
        ObjectHelper.bindAllMethods(this, this);

        /* Hide all private properties (starting with '_') and methods from enumeration,
         * so when you do for( in ), only actual data properties show up. */
        ObjectHelper.hideMethodsAndPrivatePropertiesFromObject(this);

        /* Hide the priority field from enumeration, so we don't save it to the dataSource. */
        ObjectHelper.hidePropertyFromObject(Object.getPrototypeOf(this), 'length');

        /* If no dataSource is given, create own one with guessed path */
        if(!dataSource) {
            let modelName = Object.getPrototypeOf(this).constructor.name;
            let path = modelName; //+ 's';

            // retrieve dataSource from the DI context
            dataSource = Context.getContext().get(DataSource);

            dataSource = dataSource.child(path);
            this._dataSource = dataSource;
        }

        /* If a snapshot is present use it, otherwise generate one by subscribing to the dataSource one time. */
        if (dataSnapshot) {
            this._buildFromSnapshot(dataSnapshot);
        } else {
            this._buildFromDataSource(dataSource);
        }
    }

    /**
     * Subscribes to events emitted by this PrioritisedArray.
     * @param {String} event 'value', 'child_changed', 'child_moved', 'child_removed'
     * @param {Function} fn Function to call when event is emitted.
     * @param {Object} context Object to bind the given callback function to.
     * @returns {*}
     */
    on(event, fn, context) {
        return this._eventEmitter.on(event, fn, context);
    }

    /**
     * Removes subscription to events emitted by this PrioritisedArray. If no fn or context is given, all handlers for
     * the given event are removed. If no parameters are given at all, all event types will have their handlers removed.
     * @param {String} event 'value', 'child_changed', 'child_moved', 'child_removed'
     * @param {Function} fn Function to call when event is emitted.
     * @param {Object} context Object to bind the given callback function to.
     * @returns {*}
     */
    off(event, fn, context) {

        if(event && (fn || context)) {
            this._eventEmitter.removeListener(event, fn, context);
        } else {
            this._eventEmitter.removeAllListeners(event);
        }
    }

    /**
     * Adds a model instance to the rear of the PrioritisedArray
     * @param {Model} model Subclass of Model
     * @returns {*} Same model as the one originally passed as parameter
     */
    add(model) {
        if (model instanceof this._dataType) {
            if (this._findIndexById(model.id) < 0) {
                //model.priority = this.length;
                this.push(model);

                if (!model._inheritable) {
                    model.on('value', (modelData) => {
                        this._onChildChanged(modelData);
                    });
                }

            } else {
                /* TODO: change to throw exception */
                console.log('Tried to append an object with the same ID as one already present.');
            }
        }
        /* Let's try to parse the object using property reflection */
        else if(model instanceof Object) {
            // retrieve dataSource from the DI context
            var options = { dataSource: this._dataSource};
            let newModel = new this._dataType(null, model, options);
            this.add(newModel);
        }
        else {
            /* TODO: change to throw exception */
            console.log('Tried to append an object that is not the same type as the one this PrioritisedArray was created with.');
        }

        /* Return model so we can do this: let newModel = PrioArray.add(new Model()); newModel.someProperty = true; */
        return model;
    }

    /**
     * Inserts a model instance at the given position of the PrioritisedArray, and recalculates the priority (position)
     * of all models after the inserted position.
     * @param {Model} model Subclass of Model
     * @param {Number} position Zero-based index where to put the new model instance.
     */
    insertAt(model, position) {
        if (model instanceof this._dataType) {
            this.splice(position, 0, model);
            this._recalculatePriorities(position);
        }
        else {
            /* TODO: change to throw exception */
            console.log('Tried to append an object that is not the same type as the PrioritisedArray was created with.');
        }

        /* Return model so we can do this: let newModel = PrioArray.add(new Model()); newModel.someProperty = true; */
        return model;
    }

    /**
     * Moves a model instance from one position to another.
     * @param {Number} fromPosition Zero-based index of original position
     * @param {Number} toPosition Zero-based index of target position
     */
    move(fromPosition, toPosition) {
        let model = this[fromPosition];
        this.splice(fromPosition, 1);
        this.splice(toPosition, 0, model);
        this._recalculatePriorities();
    }

    /**
     * Removes the model instance at the given position. Does not remove the model from the datasource, to do that
     * call model.remove() directly, or PrioArray[index].remove().
     * @param position
     */
    remove(position) {
        this.splice(position, 1);
    }

    /**
     * Assigns models' priorities based on their position in the PrioritisedArray.
     * @param {Number} start Index to start calculation from, so we don't process unnecessary models.
     * @private
     */
    _recalculatePriorities(start = 0) {
        this._isBeingReordered = true;
        for (let i = start; i < this.length; i++) {
            this[i].priority = i;
        }
        this._isBeingReordered = false;
    }

    /**
     * Interprets all childs of a given snapshot as instances of the given data type for this PrioritisedArray,
     * and attempts to instantiate new model instances based on these sub-snapshots. It adds them to the
     * PrioritisedArray, which also assigns their priority based on their inserted position.
     * @param {Snapshot} dataSnapshot
     * @private
     */
    _buildFromSnapshot(dataSnapshot) {
        dataSnapshot.forEach(
            /** @param {Snapshot} child **/
            function(child){
                /* Create a new instance of the given data type and prefill it with the snapshot data. */
                let options = {dataSnapshot: child};

                /* whenever the ref() is a datasource, we can bind that source to the model.
                 * whenever it's not a datasource, we assume the model should instantiate a new
                  * datasource to bind the model */

                 if (child.ref() instanceof DataSource)
                    options.dataSource = child.ref();
                 else {
                     var rootPath = child.ref().root().toString();
                     options.path = child.ref().toString().replace(rootPath,'/');
                 }

                let newModel = new this._dataType(child.key(), child.val(), options);
                this.add(newModel);

            }.bind(this));

        if (dataSnapshot.ref() instanceof DataSource &&
            dataSnapshot.ref().inheritable)
            this._eventEmitter.emit('value', this);

        //this._registerCallbacks(this._dataSource);
    }


    /**
     * Clones a dataSource (to not disturb any existing callbacks defined on the original) and uses it
     * to get a dataSnapshot which is used in _buildSnapshot to build our array.
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
            this._registerCallbacks(newSource);
        });

    }

    _registerCallbacks(dataSource) {
        dataSource.setChildAddedCallback(this._onChildAdded);
        dataSource.setChildMovedCallback(this._onChildMoved);
        if (dataSource.inheritable)
            dataSource.setChildChangedCallback(this._onChildChanged);
        dataSource.setChildRemovedCallback(this._onChildRemoved);
    }

    /**
     * Called by dataSource when a new child is added.
     * @param {Snapshot} snapshot
     * @private
     */
    _onChildAdded(snapshot) {
        let id = snapshot.key();
        let model = this.add(new this._dataType(id, null, {dataSnapshot: snapshot}));

        this._eventEmitter.emit('child_added', model);
        this._eventEmitter.emit('value', this);
    }

    /**
     *
     */
    _onChildChanged(snapshot) {
        let id = snapshot.key();
        let itemIndex = this._findIndexById(id);
        let changedModel = new this._dataType(id, null, {dataSnapshot: snapshot, dataSource: snapshot.ref() });
        this[itemIndex] = changedModel;

        this._eventEmitter.emit('child_changed', changedModel);
        this._eventEmitter.emit('value', this);
    }

    /**
     * Called by dataSource when a child is moved, which changes its priority.
     * @param {Snapshot} snapshot
     * @private
     */
    _onChildMoved(snapshot) {
        /* Ignore priority updates whilst we're reordering to avoid floods */
        if (!this._isBeingReordered) {
            this._recalculatePriorities();

            let id = snapshot.key();
            let position = this._findIndexById(id);
            let model = this[position];

            this._eventEmitter.emit('child_moved', model);
            this._eventEmitter.emit('value', this);
        }
    }

    /**
     * Called by dataSource when a child is removed.
     * @param {Snapshot} oldSnapshot
     * @private
     */
    _onChildRemoved(oldSnapshot) {
        /* TODO: figure out if we can use the snapshot's priority as our array index reliably, to avoid big loops. */
        let id = oldSnapshot.key();
        let position = this._findIndexById(id);
        let model = this[position];

        if (position !== -1) {
            this.remove(position, false);

            this._eventEmitter.emit('child_removed', model);
            this._eventEmitter.emit('value', this);
        }
    }

    /**
     * Searches for the index in the PrioritisedArray of a model that has an id equal to the given id.
     * @param id Id field of the model we're looking for
     * @returns {Number} Zero-based index if found, -1 otherwise
     * @private
     */
    _findIndexById(id) {
        for (let i = 0; i < this.length; i++) {
            if (this[i].id == id) {
                return (i);
            }
        }
        return -1;
    }

}