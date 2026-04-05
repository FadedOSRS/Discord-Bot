const { buildPriceSlash, executePriceLookup } = require('../utils/itemPriceSlash');

module.exports = {
  data: buildPriceSlash('price', 'Look up an OSRS Grand Exchange item price.'),
  execute: executePriceLookup
};
