function parseId(idParam) {
  const id = Number(idParam);
  if (Number.isNaN(id)) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }
  return id;
}

module.exports = { parseId };
