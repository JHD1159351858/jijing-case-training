(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CaseCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function unique(items) {
    return Array.from(new Set(items));
  }

  function lcsLength(actual, expected) {
    var row = new Array(expected.length + 1).fill(0);
    for (var i = 0; i < actual.length; i += 1) {
      var diagonal = 0;
      for (var j = 1; j <= expected.length; j += 1) {
        var above = row[j];
        row[j] = actual[i] === expected[j - 1]
          ? diagonal + 1
          : Math.max(row[j], row[j - 1]);
        diagonal = above;
      }
    }
    return row[expected.length];
  }

  function validateVolume(actualIds, expectedIds, base) {
    if (!Array.isArray(actualIds) ||
        !Array.isArray(expectedIds) || expectedIds.length === 0 ||
        !Number.isFinite(base) || base <= 0) return null;

    var actual = unique(actualIds);
    var expected = unique(expectedIds);
    var expectedSet = new Set(expected);
    var actualSet = new Set(actual);
    var correctlyFiled = actual.filter(function (id) { return expectedSet.has(id); });
    var contentCorrect = correctlyFiled.length;

    // 教学Demo暂定规则：剔除错误归类项后，以最长公共子序列（LCS）
    // 计算相对顺序正确数。缺件不导致后续全部错位；正式规则需由教师确认。
    var orderCorrect = lcsLength(correctlyFiled, expected);
    var contentRate = Math.min(contentCorrect / base, 1);
    var orderRate = Math.min(orderCorrect / base, 1);
    return {
      contentCorrect: contentCorrect,
      orderCorrect: orderCorrect,
      base: base,
      contentRate: contentRate,
      orderRate: orderRate,
      rate: orderRate,
      passed: orderRate >= 0.6,
      misplacedIds: actual.filter(function (id) { return !expectedSet.has(id); }),
      missingIds: expected.filter(function (id) { return !actualSet.has(id); })
    };
  }

  function score(results) {
    if (!results || typeof results !== 'object') return null;
    var keys = ['litigation', 'evidence', 'work'];
    var weights = [30, 50, 20];
    var output = {};
    var total = 0;
    for (var i = 0; i < keys.length; i += 1) {
      var result = results[keys[i]];
      if (!result || !Number.isFinite(result.rate) ||
          result.rate < 0 || result.rate > 1) return null;
      output[keys[i]] = result.rate * weights[i];
      total += output[keys[i]];
    }
    output.total = total;
    return output;
  }

  function moveItem(items, from, to) {
    var copy = Array.isArray(items) ? items.slice() : [];
    if (!Number.isInteger(from) || !Number.isInteger(to) ||
        from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy;
    var item = copy.splice(from, 1)[0];
    copy.splice(to, 0, item);
    return copy;
  }

  function addUnique(items, ids) {
    return unique((Array.isArray(items) ? items : []).concat(Array.isArray(ids) ? ids : []));
  }

  return {
    validateVolume: validateVolume,
    score: score,
    moveItem: moveItem,
    addUnique: addUnique
  };
});
