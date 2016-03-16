/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.

 @author: Tom Clement (tjclement)
 @license MIT
 @copyright Bizboard, 2015

 */

import _                    from 'lodash';
import {Context}            from 'arva-utils/Context.js';
import {ObjectHelper}       from 'arva-utils/ObjectHelper.js';
import {PrioritisedObject}  from './PrioritisedObject.js';
import {DataSource}         from './DataSource.js';

export class Model extends PrioritisedObject {

    /**
     * Creates a new instance of a model.
     * @param {String} id Optional: The identifier for this model. For a user model this might be a user ID, for example. It
     *           is used to build the path to the dataSource. This path is <root>/<model name appended with 's'>/<id>.
     *           If no id is given, a randomly generated one will be pushed to the dataSource. You can use this for
     *           creating new objects in the dataSource.
     * @param {Object} data Optional: The initial data to fill the model with. The model will be extended with any
     *                      properties present in the data parameter.
     * @param {Object} options Optional: Additional options. Currently used is "dataSnapshot", which if present is used
     *                          to fetch the initial model data. If not present, the model will add a one-time
     *                          subscription to the dataSource to fetch initial data.
     * @returns {Model} Model Instance.
     */
    constructor(id, data = null, options = {}) {

        /* Retrieve dataSource from the DI context */
        let dataSource = Context.getContext().get(DataSource);
        /* As an option parameter, we can forward the setterCallback */
        super(null,null,options.setterCallback ? {setterCallback: options.setterCallback} : {});


        /* Replace all stub data fields of any subclass of Model with databinding accessors.
         * This causes changes to be synched to and from the dataSource. */
        this._replaceModelAccessorsWithDatabinding();


        /* Calculate path to model in dataSource, used if no dataSource or path are given. */
        let modelName = Object.getPrototypeOf(this).constructor.name;
        let pathRoot = modelName + 's';

        if(options.dataSource && id) {
            this._dataSource = options.dataSource;
        } else if(options.dataSource) {
            /* No id is present, generate a random one by pushing a new entry to the dataSource. */
            this._dataSource = options.dataSource.push(data);
        } else if(options.path && id) {
            this._dataSource = dataSource.child(options.path + '/' + id || '')
        } else if(options.dataSnapshot){
            this._dataSource = dataSource.child(options.dataSnapshot.ref().path.toString());
        } else if (id) {
            /* If an id is present, use it to locate our model. */
            this._dataSource = dataSource.child(pathRoot).child(id);
        } else {
            /* No id is present, generate a random one by pushing a new entry to the dataSource. */
            if (options.path) {
                this._dataSource = dataSource.child(options.path).push(data);
            } else {
                this._dataSource = dataSource.child(pathRoot).push(data);
            }
        }

        /* Re-construct core PrioritisedObject with new dataSource */
        if (options.dataSnapshot) {
            this._buildFromSnapshot(options.dataSnapshot);
        } else {
            this._buildFromDataSource(this._dataSource);
        }

        /* Write local data to model, if any data is present. */
        this._writeLocalDataToModel(data);
    }

    /**
     * Replaces all getters/setters defined on the model implementation with properties that trigger update events to the dataSource.
     * @returns {void}
     * @private
     */
    _replaceModelAccessorsWithDatabinding() {
        let prototype = Object.getPrototypeOf(this);

        while (prototype.constructor.name !== 'Model') {
            /* Get all properties except the id and constructor of this model */
            let propNames = _.difference(Object.getOwnPropertyNames(prototype), ['constructor', 'id']);

            for (let name of propNames) {
                let descriptor = Object.getOwnPropertyDescriptor(prototype, name);
                if (descriptor && descriptor.get) {
                    let value = this[name];
                    delete this[name];
                    ObjectHelper.addPropertyToObject(this, name, value, true, true, () => { this._onSetterTriggered(); });
                }
            }
            /* Add 'remoteId' separately so we're able to wait for remote id when needed */
            ObjectHelper.addPropertyToObject(this, 'remoteId', {}, true, true, () => { this._onSetterTriggered(); });


            prototype = Object.getPrototypeOf(prototype);
        }
    }

    /**
     * Writes data, if present, to the Model's dataSource. Uses a transaction, meaning that only one update is triggered to the dataSource,
     * even though multiple fields change.
     * @param {Object} data Data to write, can be null.
     * @returns {void}
     * @private
     */
    _writeLocalDataToModel(data) {
        if (data) {
            let isDataDifferent = false;
            for (let name in data) {
                if (Object.getOwnPropertyDescriptor(this, name) && this[name] !== data[name]) {
                    isDataDifferent = true;
                    break;
                }
            }

            if (isDataDifferent) {
                this.transaction(function () {
                    for (let name in data) {

                        // only map properties that exists on our model
                        if (Object.getOwnPropertyDescriptor(this, name)) {
                            let value = data[name];
                            this[name] = value;
                        }
                    }
                }.bind(this));
            }
        }
    }
}
