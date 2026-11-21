// A faster drop-in for csv-reader 1.0.0, make.fun's own CSV reader.
//
// run(input) returns, for every case's input {text, header}, exactly the
// answer csv-reader 1.0.0 returns: {columns, rows, errors}. The reading
// policy is csv-reader's own, restated from its reference program:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is
//     no record;
//   - outside a quoted field a CR not followed by LF is dropped (error
//     stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, and each CRLF or lone CR inside it
//     is read as LF; what follows its closing quote, up to the next comma
//     or line break, is appended to it as it stands (quote_junk, when the
//     field ends); a quote that never closes is a literal character, and
//     the text after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows
//     holds the records after it (every record when header is false), each
//     padded with "" (short_row, with fields: its count) or cut (long_row,
//     with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on (every LF, CRLF and lone CR inside a quoted field counted),
//     row its record's index in rows (null for the header), in the order
//     met, a field's quote_junk when the field ends and a record's
//     short_row or long_row when the record ends.
//
// Why this is faster than the reference: the reference reads one
// character at a time and builds every field up a character at a time.
// This reader jumps instead of stepping: an unquoted field is found with
// one native scan for its next delimiter and taken with a single slice,
// and a quoted field jumps from quote to quote with indexOf, slicing the
// runs between them. The slow per-character work happens only where the
// policy needs it: stray CRs, and CR/LF inside a quoted field. Nothing is
// cached from one case to the next; run is pure.
//
// Dependency-free ES module. No network, no clock, no randomness.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** Character codes the scanner tests. */
const C_COMMA = 44;
const C_LF = 10;
const C_CR = 13;
const C_QUOTE = 34;

/** The next delimiter of an unquoted field: comma, LF or CR. */
const DELIM = /[,\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Every error of the record carries these.
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads the run text[a, b) of a quoted field, turning each CRLF and each
  // lone CR into one LF and counting every line break it holds. The common
  // run holds no line break at all and is one slice.
  function convert(a, b) {
    const nl = text.indexOf("\n", a);
    if (nl !== -1 && nl < b) return convertSlow(a, b);
    const cr = text.indexOf("\r", a);
    if (cr !== -1 && cr < b) return convertSlow(a, b);
    return text.slice(a, b);
  }

  function convertSlow(a, b) {
    let out = "";
    let s = a;
    let i = a;
    while (i < b) {
      const ch = text.charCodeAt(i);
      if (ch === C_CR) {
        out += text.slice(s, i);
        out += "\n";
        line += 1;
        i += text.charCodeAt(i + 1) === C_LF ? 2 : 1;
        s = i;
      } else if (ch === C_LF) {
        out += text.slice(s, i);
        out += "\n";
        line += 1;
        i += 1;
        s = i;
      } else {
        i += 1;
      }
    }
    out += text.slice(s, b);
    return out;
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the field
  // and how it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    let start = pos;
    for (;;) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        added += n - start;
        if (start < n) value += text.slice(start, n);
        pos = n;
        return { value, ended: END, added };
      }
      const d = m.index;
      const c = text.charCodeAt(d);
      if (c === C_COMMA) {
        added += d - start;
        if (start < d) value += text.slice(start, d);
        pos = d + 1;
        return { value, ended: COMMA, added };
      }
      if (c === C_LF) {
        added += d - start;
        if (start < d) value += text.slice(start, d);
        pos = d + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: a CRLF ends the field, a lone one is dropped (stray_cr).
      if (text.charCodeAt(d + 1) === C_LF) {
        added += d - start;
        if (start < d) value += text.slice(start, d);
        pos = d + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      error("stray_cr");
      added += d - start;
      if (start < d) value += text.slice(start, d);
      pos = d + 1;
      start = pos;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = "";
    pos += 1;
    let segStart = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error("unterminated_quote");
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === C_QUOTE) {
        // A doubled quote is one literal quote inside the field.
        value += convert(segStart, q);
        value += '"';
        pos = q + 2;
        segStart = pos;
        continue;
      }
      value += convert(segStart, q);
      pos = q + 1;
      break;
    }
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === C_COMMA) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === C_LF) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === C_CR && text.charCodeAt(pos + 1) === C_LF) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error("quote_junk");
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === C_LF) {
        pos += 1;
        line += 1;
      } else if (c === C_CR && text.charCodeAt(pos + 1) === C_LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === C_QUOTE;
      field = quoted ? readQuoted() : readUnquoted("");
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === "" && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: "short_row", line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push("");
    } else if (fields.length > width) {
      errors.push({ code: "long_row", line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
