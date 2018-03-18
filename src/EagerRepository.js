const impl = require('./impl')
const Repository = require('./Repository')
const dbTools = require('./dbTools')

const privateToken_ = Symbol('private-token')

/**
 * Repository that eagerly builds up it collection of objects in-memory
 * and keeps them updated as new events are streamed in.
 * 
 * An instance should only be created via the EagerRepository.create()
 * static method.
 */
class EagerRepository extends Repository {

    constructor(connectionOrClient, name, basePath, ModelClass, privateToken) {
        super(connectionOrClient, name, basePath)
        if (privateToken !== privateToken_) {
            throw new Error('EagerRepository must be created via EagerRepository.create()')
        }
        this.ModelClass = ModelClass

        // State to hold messages received before all historical messages have been delivered
        this.buffer = []
        this.hasFetched = false
        
        // Internal storage for all models, sorted by ID
        this.table = []
        // By default, models are not indexed in any way, and searching does a full
        // scan of the table. Indexing functions may be specified that build
        // up ordered indexes that allow for efficient retrieval. Yes, this is
        // essentially a tiny, inefficient in-memory database.
        this.indexes = {}
        this.indexFns = {}

        this.handle = this.handle.bind(this)
    }

    static async create(connectionOrClient, name, basePath, ModelClass) {
        const inst = new EagerRepository(connectionOrClient, name, basePath, ModelClass, privateToken_)
        
        impl.subscribe(inst.connection, inst.basePath, (event) => {
            if (!hasFetched) {
                buffered.push(event)
                return
            }

            inst.handle(event)
        })

        const feed = await impl.getEvents(inst.connection, inst.basePath)
        const firstSubscribedEvent = (inst.buffer.length > 0) ? inst.buffer : null
        
        feed.events
            .filter(e => firstSubscribedEvent === null || e['tx-id'] < firstSubscribedEvent['tx-id'])
            .forEach(inst.handle)

        inst.hasFetched = true
        for (const event of inst.buffer) {
            inst.handle(event)
        }

        return inst
    }

    createIndex(name, fn) {
        const idx = []
        this.indexFns[name] = fn
        this.indexes[name] = idx
        
        // Add existing rows to index
        this.table.forEach(row => dbTools.idxInsert(idx, row, fn))
    }

    queryIndex(name, value) {
        const idx = this.indexes[name]
        if (!idx) {
            throw new Error(`Cannot query nonexistent index: ${name}`)
        }
        
        return dbTools.indexedTblLookup(this.table, idx, value)
    }

    handle(evt) {
        const path = evt.feed.split('/')
        const id = path[path.length - 1]
        let model = dbTools.tblLookup(this.table, id)
        const idxNames = Object.keys(this.indexFns)
        const isNew = !model
        
        if (isNew) {
            model = new this.ModelClass()
        } else {
            // Remove from existing indexes
            // TODO: only rewrite in index for indexes that actually change, not every index
            idxNames.forEach(idxName =>
                dbTools.idxRemove(this.indexes[idxName], model, this.indexFns[idxName]))
        }

        model.handle(evt.data)
        if (isNew) {
            dbTools.tblInsert(this.table, model)
        }

        // (re-)add to indexes with possibly updated values
        idxNames.forEach(idxName =>
            dbTools.idxInsert(this.indexes[idxName], model, this.indexFns[idxName]))

        return model
    }

    async fetch(id) {
        return dbTools.tblLookup(this.table, id)
    }

    async fetchAll() {
        return this.table
    }
}

module.exports = EagerRepository