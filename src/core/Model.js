/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.

 @author: Tom Clement (tjclement)
 @license MIT
 @copyright Bizboard, 2015

 */

import _                    from 'lodash';
import {PrioritisedObject}  from './Model/prioritisedObject';
import {DataSource}         from './DataSource';
import {ObjectHelper}       from 'arva-utils/ObjectHelper';
import {Context}            from 'arva-utils/Context';

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
     */
    constructor(id, data = null, options = {}) {

        /* Retrieve dataSource from the DI context */
        let dataSource = Context.getContext().get(DataSource);

        if (options.path) {
            super(dataSource.child(options.path), options.dataSnapshot);
        } else if (options.dataSource) {
            super(options.dataSource, options.dataSnapshot);
        } else if (options.dataSnapshot) {
            super(dataSource.child(options.dataSnapshot.ref().path.toString()), options.dataSnapshot);
        }
        else {
            super();
        }

        /* Replace all stub data fields of any subclass of Model with databinding accessors.
         * This causes changes to be synched to and from the dataSource */
        this._replaceModelAccessorsWithDatabinding();


        /* Calculate path to model in dataSource */
        let modelName = Object.getPrototypeOf(this).constructor.name;
        let pathRoot = modelName + 's';


        /* If an id is present, use it to locate our model. */
        if(id){
            this.id = id;
            if (options.dataSource) { this._dataSource = options.dataSource; }
            else if (options.path) { this._dataSource = dataSource.child(options.path); }
            else { this._dataSource = dataSource.child(pathRoot).child(id); }
        } else {
            /* No id is present, check if we have a dataSnapshot we can extract it from.
             * If we can't, generate a random one by pushing a new entry to the dataSource. */
            if(options.dataSnapshot) {
                id = options.dataSnapshot.key();
                this._dataSource = dataSource.child(pathRoot).child(id);
            } else {
                if (options.dataSource) this._dataSource = options.dataSource.push(data);
                else if (options.path) this._dataSource = dataSource.child(options.path).push(data);
                else {
                    this._dataSource = dataSource.child(pathRoot).push(data);
                }
                this.id = this._dataSource.key();
            }
        }

        /* Construct core PrioritisedObject */
        if (options.dataSnapshot) this._buildFromSnapshot(options.dataSnapshot);
        else this._buildFromDataSource(this._dataSource);



        /* Write local data to model, if any data is present */
        if(data) {
            this._isBeingWrittenByDatasource = true;
            for(let name in data) {

                // only map properties that exists on our model
                if (Object.getOwnPropertyDescriptor(this, name)) {
                    let value = data[name];
                    this[name] = value;
                }
            }
            this._isBeingWrittenByDatasource = false;

            /* Trigger update to dataSource when we have an unbound record */
            if (!id)
                this._onSetterTriggered();
        }
    }

    _replaceModelAccessorsWithDatabinding() {
        let prototype = Object.getPrototypeOf(this);

        while(prototype.constructor.name !== 'Model') {
            /* Get all properties except the id and constructor of this model */
            let propNames = _.difference(Object.getOwnPropertyNames(prototype), ['constructor', 'id']);

            for(let name of propNames) {
                let descriptor = Object.getOwnPropertyDescriptor(prototype, name);
                if(descriptor && descriptor.get) {
                    let value = this[name];
                    delete this[name];
                    ObjectHelper.addPropertyToObject(this, name, value, true, true, () => {this._onSetterTriggered()});
                }
            }

            prototype = Object.getPrototypeOf(prototype);
        }
    }
}

