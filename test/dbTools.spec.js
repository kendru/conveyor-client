const { expect } = require('chai')
const db = require('../src/dbTools')


describe('Database tools', () => {

    describe('tables', () => {

        it('should look up a value by primary key', () => {
            const tbl = range(100).map(model)

            expect(db.tblLookup(tbl, 17)).to.eql(model(17))
        })

        it('should insert a single record into a table', () => {
            const tbl = []
            const record = model(7)

            db.tblInsert(tbl, record)

            expect(tbl).to.eql([ record ])
        })

        it('should insert a pair of ordered records into a table', () => {
            const tbl = []
            const r1 = model(1)
            const r2 = model(2)

            db.tblInsert(tbl, r1)
            db.tblInsert(tbl, r2)

            expect(tbl).to.eql([ r1, r2 ])
        })

        it('should insert a pair of reversed records into a table', () => {
            const tbl = []
            const r1 = model(1)
            const r2 = model(2)

            db.tblInsert(tbl, r2)
            db.tblInsert(tbl, r1)

            expect(tbl).to.eql([ r1, r2 ])
        })

        it('should order the records by primary key in a table on insert', () => {
            const tbl = []
            const records = range(100).map(model)
            while (isOrdered(records)) shuffle(records)

            records.forEach(record => db.tblInsert(tbl, record))
            
            expect(tbl).to.eql(range(100).map(model))
        })
    })

    describe('indexes', function () {
        let idx

        beforeEach(() => {
            idx = []
        })

        it('should insert an index record from a computed property', () => {
            const m = model(1, { name: 'Andrew' })

            db.idxInsert(idx, m, byName)

            expect(idx).to.eql([
                { val: 'Andrew', rows: [1] }
            ])
        })

        it('should append to an index record from a duplicate property', () => {
            const m1 = model(1, { name: 'Andrew' })
            const m2 = model(2, { name: 'Andrew' })

            db.idxInsert(idx, m1, byName)
            db.idxInsert(idx, m2, byName)

            expect(idx).to.eql([
                { val: 'Andrew', rows: [1, 2] }
            ])
        })

        it('should preserve in-order index records', () => {
            const alice = model(1, { name: 'Alice' })
            const bob = model(2, { name: 'Bob' })

            db.idxInsert(idx, alice, byName)
            db.idxInsert(idx, bob, byName)

            expect(idx).to.eql([
                { val: 'Alice', rows: [1] },
                { val: 'Bob', rows: [2] },
            ])
        });
        
        it('should order out-of-order index records', () => {
            const alice = model(1, { name: 'Alice' })
            const bob = model(2, { name: 'Bob' })

            db.idxInsert(idx, bob, byName)
            db.idxInsert(idx, alice, byName)

            expect(idx).to.eql([
                { val: 'Alice', rows: [1] },
                { val: 'Bob', rows: [2] },
            ])
        })

        it('should remove a record from an index', () => {
            const alice = model(1, { name: 'Alice' })
            const bob = model(2, { name: 'Bob' })
            const alice2 = model(3, { name: 'Alice' })

            db.idxInsert(idx, alice, byName)
            db.idxInsert(idx, bob, byName)
            db.idxInsert(idx, alice2, byName)

            db.idxRemove(idx, bob, byName)
            db.idxRemove(idx, alice, byName)

            expect(idx).to.eql([
                { val: 'Alice', rows: [3] }
            ])
        })

        it('should consider remove a no-op on an empty index', () => {
            const idx = []

            db.idxRemove(idx, model(1, { name: 'Reginald' }), byName)

            expect(idx).to.eql([])
        })

        it('should not remove a non-matching record', () => {
            const alice = model(1, { name: 'Alice' })
            const bob = model(2, { name: 'Bob' })

            db.idxInsert(idx, alice, byName)

            db.idxRemove(idx, bob, byName)

            expect(idx).to.eql([
                { val: 'Alice', rows: [1] }
            ])
        })
    })

    describe('indexed lookups', () => {
        let tbl
        let idx

        beforeEach(() => {
            tbl = []
            idx = []

            const records = [
                model(1, { name: 'Alice' }),
                model(2, { name: 'Bob' }),
                model(3, { name: 'Alice' })
            ];
            
            records.forEach(record => {
                db.tblInsert(tbl, record)
                db.idxInsert(idx, record, byName)
            })
        })

        it('should look up a single item via an index', () => {
            expect(db.indexedTblLookup(tbl, idx, 'Bob'))
                .to.eql([ model(2, { name: 'Bob' }) ])
        })

        it('should look up multiple items via an index', () => {
            expect(db.indexedTblLookup(tbl, idx, 'Alice'))
                .to.eql([
                    model(1, { name: 'Alice' }),
                    model(3, { name: 'Alice' })
                ])
        })

        it('should return empty for a nonexistent value', () => {
            expect(db.indexedTblLookup(tbl, idx, 'Carol')).to.eql([])
        })
    })
})

function byName(record) {
    return record.name
}

function range(size) {
    const r = Array(size)
    for (let i = 0; i < size; i++) r[i] = i

    return r
}

function model(id, addlProps = {}) {
    return Object.assign({
        id,
        primaryKey: id
    }, addlProps)
}

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex

    while (0 !== currentIndex) {
        randomIndex = Math.floor(Math.random() * currentIndex)
        currentIndex -= 1
        temporaryValue = array[currentIndex]
        array[currentIndex] = array[randomIndex]
        array[randomIndex] = temporaryValue
    }
}

function isOrdered(records) {
    let [ last, ...rest ] = records

    if (rest.length === 0) {
        return true
    }
    for (let current of rest) {
        if (last.primaryKey > current.primaryKey) return false
        last = current
    }
    return true
}