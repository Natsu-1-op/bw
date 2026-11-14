'use strict';
(() => {
  // 英式音标，键为词条小写形式。短语给出一种读法，不含斜杠。
  // construct 在词库里是名词「理论构念」。
  const terms = {
    // C14T3
    "extant": "ˈekstənt",
    "perform a task": "pəˈfɔːm ə tɑːsk",
    "in the course of": "ɪn ðə kɔːs əv",
    "construct": "ˈkɒnstrʌkt",
    "from scratch": "frəm ˈskrætʃ",
    "primate": "ˈpraɪmeɪt",
    "intestinal": "ˌɪnˈtestɪnəl",
    "daunting": "ˈdɔːntɪŋ",
    "secrete": "sɪˈkriːt",
    "ubiquity": "juːˈbɪkwəti",
    "subdue": "səbˈdjuː",
    "pathogenic": "ˌpæθəˈdʒenɪk",
    "snip out": "snɪp aʊt",
    "precedent": "ˈpresɪdənt",
    "expound": "ɪkˈspaʊnd",
    "dichotomy": "daɪˈkɒtəmi",
    "repertoire": "ˈrepətwɑː",
    "elude": "ɪˈluːd",
    "theorist": "ˈθɪərɪst",
    "discrete": "dɪˈskriːt",
    "continuum": "kənˈtɪnjuəm",
    "non-literal": "ˌnɒn ˈlɪtərəl",
    "determine": "dɪˈtɜːmɪn",
    "curriculum": "kəˈrɪkjələm",
    // C14T4
    "feat": "fiːt",
    "attend to": "əˈtend tuː",
    "mandible": "ˈmændɪbəl",
    "mixed results": "mɪkst rɪˈzʌlts",
    "senescence": "sɪˈnesəns",
    "life expectancy": "laɪf ɪkˈspektənsi",
    "colossal": "kəˈlɒsəl",
    "captive bred": "ˈkæptɪv bred",
    "few and far between": "fjuː ənd fɑː bɪˈtwiːn",
    "initiative": "ɪˈnɪʃətɪv",
    "outreach": "ˈaʊtriːtʃ",
    "bolster": "ˈbəʊlstə",
    "anaesthetic": "ˌænəsˈθetɪk",
    "dismal": "ˈdɪzməl",
    "perceived dangers": "pəˈsiːvd ˈdeɪndʒəz",
    "ingest": "ɪnˈdʒest",
    "entangle": "ɪnˈtæŋɡəl",
    "toiletries": "ˈtɔɪlətriz",
    "synthetic": "sɪnˈθetɪk",
    "concentration": "ˌkɒnsənˈtreɪʃən",
    "conjure up": "ˈkʌndʒər ʌp",
    "interrogate": "ɪnˈterəɡeɪt",
    // C16T1
    "shed light on": "ʃed laɪt ɒn",
    "mutation": "mjuːˈteɪʃən",
    "nutrient availability": "ˈnjuːtriənt əˌveɪləˈbɪləti",
    "maternity den": "məˈtɜːnəti den",
    "fasting": "ˈfɑːstɪŋ",
    "hibernate": "ˈhaɪbəneɪt",
    "bedridden": "ˈbedrɪdən",
    "anecdotal": "ˌænɪkˈdəʊtəl",
    "dislodge": "dɪsˈlɒdʒ",
    "agile": "ˈædʒaɪl",
    "out of frustration": "aʊt əv frʌˈstreɪʃən",
    "miss out on": "mɪs aʊt ɒn",
    "hold interest for sb": "həʊld ˈɪntrəst fə ˈsʌmbədi",
    "tribute": "ˈtrɪbjuːt",
    "deceased": "dɪˈsiːst",
    "it is now known that": "ɪt ɪz naʊ nəʊn ðət",
    "complex": "ˈkɒmpleks",
    "inscribe": "ɪnˈskraɪb",
    "excavate": "ˈekskəveɪt",
    "constitute": "ˈkɒnstɪtjuːt",
    "without exaggeration": "wɪˈðaʊt ɪɡˌzædʒəˈreɪʃən",
    "business consultancy": "ˈbɪznəs kənˈsʌltənsi",
    "disruptive": "dɪsˈrʌptɪv",
    "novice": "ˈnɒvɪs",
    "campaign": "kæmˈpeɪn",
    "intuition": "ˌɪntʃuːˈɪʃən",
    "envisage": "ɪnˈvɪzɪdʒ",
    "fallacy": "ˈfæləsi",
    "subsistence agriculture": "səbˈsɪstəns ˈæɡrɪkʌltʃə",
    // 乐器学习的益处
    "cast doubt on": "kɑːst daʊt ɒn",
    "impaired hearing": "ɪmˈpeəd ˈhɪərɪŋ",
    "make up for": "meɪk ʌp fɔː",
    "spiral": "ˈspaɪrəl",
    // 其他来源
    "dissertation": "ˌdɪsəˈteɪʃən",
    "metaphor": "ˈmetəfə",
    "fertility rites": "fəˈtɪləti raɪts"
  };

  function fallback(term) {
    const key = typeof term === 'string' ? term.trim().toLowerCase().replace(/\s+/g, ' ') : '';
    return Object.prototype.hasOwnProperty.call(terms, key) ? terms[key] : '';
  }

  function normalize(value) {
    return typeof value === 'string' ? value.trim().replace(/^\/|\/$/g, '').trim() : '';
  }

  window.ReadingPhonetics = {
    fallback,
    normalize,
    forWord: word => normalize(word?.phonetic) || fallback(word?.term)
  };
})();
