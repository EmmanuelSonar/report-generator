function computeFromDate(months, now) {
  const d = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() - months,
    now.getUTCDate()
  ));
  return d.toISOString().slice(0, 10);
}

module.exports = { computeFromDate };
