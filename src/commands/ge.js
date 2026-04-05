const { buildPriceSlash, executePriceLookup } = require('../utils/itemPriceSlash');

module.exports = {
  data: buildPriceSlash('ge', 'Grand Exchange price lookup (same as /price).'),
  execute: executePriceLookup
};
