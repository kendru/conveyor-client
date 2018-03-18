const unsavedEvents_ = Symbol('unsaved-events')

class Model {
    constructor(id = null) {
        this[unsavedEvents_] = []
        if (id) {
            this.emit({ type: 'created', id })
        }
    }

    // For the base model class, we assume that each model has a unique
    // primary key of "id". 
    get primaryKey() {
        return this.id;
    }

    get unsavedEvents() {
        return this[unsavedEvents_]
    }

    flushEvents() {
        this[unsavedEvents_] = []
    }

    emit(event) {
        this[unsavedEvents_].push(event)
        this.handle(event)
    }

    apply(events) {
        events.forEach(e => this.handle(e))
    }

    handle(event) {
        throw new Error(`${this.constructor.name} does not implement handle()`)
    }
}

module.exports = Model