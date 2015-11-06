/**
 * Created by tom on 23/10/15.
 */

import chai                         from 'chai';
import {loadDependencies}           from './TestBootstrap.js';

let should = chai.should();

describe('SharePointDataSource', () => {
    let imports = {};

    before(() => {
        /* Mock web workers for the SharePoint client if we're running tests from nodejs */
        if(typeof Worker === 'undefined') { global.Worker = class Worker { postMessage () {} }; }

        return loadDependencies({SharePointDataSource: 'src/datasources/SharePointDataSource.js'}).then((importedObjects) => { imports = importedObjects; });
    });

    describe('#constructor', () => {
        it('builds a dataReference when given a path', () => {
            let dataSource = new imports.SharePointDataSource('http://somedomain.org/site/list');
            should.exist(dataSource._dataReference);
        });
        it('does not build a dataReference when only a site is given', () => {
            let dataSource = new imports.SharePointDataSource('http://somedomain.org/site/');
            should.not.exist(dataSource._dataReference);
        });
        it('saves its options correctly', () => {
            let query = {1:1};
            let orderBy = 'id';
            let limit = 100;
            let dataSource = new imports.SharePointDataSource('http://somedomain.org/site/', {query:query, orderBy, limit});
            dataSource.options.query.should.deep.equal(query);
            dataSource.options.orderBy.should.equal(orderBy);
            dataSource.options.limit.should.equal(limit);
        });
        it('calls setValueChangedCallback callback immediately after push', () => {
            let dataSource = new imports.SharePointDataSource('http://somedomain.org/site/List');
            let check = null;
            let childRef = dataSource.push({test:true});
            childRef.setValueChangedCallback(() => {
                check = 'pass';
            });
            if(check === null) { check = 'fail'; }
            check.should.equal('pass');
        });
        it('calls setValueChangedCallback callback immediately after set', () => {
            let dataSource = new imports.SharePointDataSource('http://somedomain.org/site/List/1');
            let check = null;
            let childRef = dataSource.set({test:true});
            childRef.setValueChangedCallback(() => {
                check = 'pass';
            });
            if(check === null) { check = 'fail'; }
            check.should.equal('pass');
        });
        it('does not have ', () => {
            let dataSource = new imports.SharePointDataSource('http://somedomain.org/site/List');
            let check = null;
            let childRef = dataSource.push({test:true});
            childRef.setValueChangedCallback(() => {
                check = 'pass';
            });
            if(check === null) { check = 'fail'; }
            check.should.equal('pass');
        });
    });
});