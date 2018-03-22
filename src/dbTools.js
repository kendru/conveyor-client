// Comparator symbols
const EQ = Symbol('equal')
const GT = Symbol('greater-than')
const LT = Symbol('less-than')

// Simple Comparitor function so that we can switch on the results rather
// than write an if-elseif-else
const cmp = (a, b) => {
    if (a  >  b) return GT
    if (a  <  b) return LT
    return EQ
}

function genericLookup(rows, val, extract) {
    if (rows.length === 0) {
        return null
    }

    const testIdx = Math.floor(rows.length / 2)
    const propAtIdx = extract(rows[testIdx])
    switch (cmp(propAtIdx, val)) {
        case EQ:
            return rows[testIdx]
        case LT:
            return genericLookup(rows.slice(testIdx + 1, rows.length), val, extract)
        case GT:
            return genericLookup(rows.slice(0, testIdx), val, extract)
    }
}

function binarySearch(arr, val, extract = x => x) {
    const rowCount = arr.length
    let idx = Math.floor(rowCount / 2)
    let searchSpace = Math.ceil(rowCount / 2)
    let i = 0
    do {
        const propAtIdx = extract(arr[idx])
        switch (cmp(propAtIdx, val)) {
            case EQ:
                searchSpace = 0
                break
            case LT:
                idx = Math.min(Math.floor(idx + searchSpace / 2), rowCount - 1)
                break
            case GT:
                idx = Math.max(Math.floor(idx - searchSpace / 2), 0)
                break
        }
        searchSpace = Math.ceil(rowCount / Math.pow(2, ++i))
    } while (searchSpace > 1)

    return (val < extract(arr[idx])) ?
        idx :
        idx + 1
}

function genericInsert(rows, val, extract) {
    if (rows.length === 0) {
        rows.push(val)
        return
    }

    const insertIdx = binarySearch(rows, extract(val), extract)
    rows.splice(insertIdx, 0, val)
}

function genericRemove(rows, val, extract) {
    const nextIndex = binarySearch(rows, val, extract)
    if (extract(rows[nextIndex - 1]) === val) {
        rows.splice(nextIndex - 1, 1);
    }
}

function tblLookup(tbl, id) {
    return genericLookup(tbl, id, m => m.primaryKey)
}

function tblInsert(tbl, model) {
    genericInsert(tbl, model, m => m.primaryKey)
}

function tblRemove(tbl, idx) {
    genericRemove(tbl, idx, m => m.primaryKey)
}

// If we were more concerned about efficiency in larger collections, we could
// implement something like a b-tree. For now, we just use the same binary search
// that we use for scanning a table.
function idxLookup(idx, val) {
    const { rows } = (genericLookup(idx, val, r => r.val) || { rows: [] })
    return rows
}

function idxInsert(idx, model, idxFn) {
    const indexVal = idxFn(model)
    let rows = idxLookup(idx, indexVal)
    if (rows.length === 0) {
        genericInsert(idx, { val: indexVal, rows }, r => r.val)
    }
    
    rows.push(model.primaryKey)
}

function idxRemove(idx, model, idxFn) {
    const indexVal = idxFn(model)
    const pkey = model.primaryKey
    let rows = idxLookup(idx, indexVal)
    if (rows.length > 0) {
        const idxToRemove = rows.indexOf(pkey)
        rows.splice(idxRemove, 1)
        if (rows.length === 0) {
            genericRemove(idx, indexVal, r => r.val)
        }
    }
}

function indexedTblLookup(tbl, idx, val) {
    return idxLookup(idx, val).map(pk => tblLookup(tbl, pk))
}

function removeFromAll(tbl, indexes, model) {
    tblRemove(tbl, model.primaryKey);
    for (const [idx, idxFn] of indexes) {
        idxRemove(idx, model, idxFn);
    }
}

module.exports = {
    tblLookup, tblInsert, tblRemove,
    idxLookup, idxInsert, idxRemove,
    indexedTblLookup,
    removeFromAll
}