const storage = new Map()

const loadStructures = (namespace) => {
  return storage.get(namespace) || null
}

const saveStructures = (namespace, data) => {
  storage.set(namespace, data)
}

module.exports = {
  loadStructures,
  saveStructures
}
