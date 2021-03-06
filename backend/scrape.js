"use strict";

var tutor = require("tutor");
var _ = require("lodash");
var db = require("./db");
var q = require("q");
var url = require("url");

module.exports.scrapeSets = function(callback) {
    q.nfcall(tutor.sets)
    .then(function(sets) {
        var promises = [];
        _.forEach(sets, function(set) {
            // always scrape promos
            if (set.substring(0, 5) == "Promo") {
                promises.push(q.fcall(scrapeSet, set));
            } else {
                promises.push(
                    q.ninvoke(db, "all", "select id from expansions where name = ?", [set])
                    .then(function (results) {
                        if (results.length == 0) {
                            return q.fcall(scrapeSet, set);
                        }
                    })
                );
            }
        });
        return q.all(promises);
    })
    .then(function() {
        console.log("Done");
    })
    .catch(callback)
    .done();
};

var getCardId = function(cardObj) {
    var u = url.parse(cardObj.gatherer_url, true);
    return u.query["multiverseid"];
};

var scrapeSet = function(set, callback) {
    console.log("Scraping " + set);

    var setId;
    // add new set (or ignore if duplicate)
    return q.ninvoke(db, "run", "insert or ignore into expansions (name) values (?)", [set])
    // get inserted ID (or the old one)
    .then(function() {
        return q.ninvoke(db, "get", "select id from expansions where name = ?", [set]);
    })
    // save ID
    .then(function(result) {
        setId = result.id;
        // get new cards in set
        return q.nfcall(tutor.set, set);
    })
    .then(function(cards) {
        var promises = [];
        // insert each
        _.forEach(cards, function(card) {
            // remove redundant versions
            delete card.versions;
            // replace letters with more easily-typable ones
            card.name = card.name.replace("Æ", "AE");
            // insert
            promises.push(
                q.ninvoke(db, "run", "insert or ignore into cards (id, name, type, expansion, rarity, manacost, fulltext, full) " +
                        "values (?, ?, ?, ?, ?, ?, ?, ?)", [
                            getCardId(card),
                            card.name,
                            card.types[0],
                            setId,
                            card.rarity,
                            card.mana_cost,
                            card.text,
                            JSON.stringify(card)
                        ])
                .then(function() {
                    console.log("Scraped " + card.name + " (" + card.expansion + ")");
                })
            );
        });
        return q.all(promises);
    });
};
