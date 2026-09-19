// SafeRoute — minimal JSON reader and writer (support code).
#include "json.hpp"

#include <charconv>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>

namespace json {

Value Value::array() { Value v; v.type_ = Type::Array; return v; }
Value Value::object() { Value v; v.type_ = Type::Object; return v; }

const Value* Value::find(const std::string& key) const {
    for (size_t i = 0; i < keys_.size(); i++)
        if (keys_[i] == key) return &items_[i];
    return nullptr;
}

Value& Value::operator[](const std::string& key) {
    for (size_t i = 0; i < keys_.size(); i++)
        if (keys_[i] == key) return items_[i];
    keys_.push_back(key);
    items_.emplace_back();
    return items_.back();
}

// ---------------------------------------------------------------- reading

namespace {

class Parser {
public:
    explicit Parser(const std::string& text) : s_(text) {
        if (s_.compare(0, 3, "\xEF\xBB\xBF") == 0) pos_ = 3;   // skip a UTF-8 byte-order mark
    }

    Value parseDocument() {
        Value v = parseValue(0);
        skipSpace();
        if (pos_ != s_.size()) error("unexpected text after the JSON value");
        return v;
    }

private:
    [[noreturn]] void error(const std::string& what) const {
        throw std::runtime_error("Invalid JSON at position " + std::to_string(pos_) + ": " + what + ".");
    }

    void skipSpace() {
        while (pos_ < s_.size() && (s_[pos_] == ' ' || s_[pos_] == '\t' || s_[pos_] == '\n' || s_[pos_] == '\r')) pos_++;
    }

    bool consume(const char* word) {
        size_t n = std::char_traits<char>::length(word);
        if (s_.compare(pos_, n, word) != 0) return false;
        pos_ += n;
        return true;
    }

    Value parseValue(int depth) {
        if (depth > 200) error("nesting is too deep");
        skipSpace();
        if (pos_ >= s_.size()) error("unexpected end of input");
        char c = s_[pos_];
        if (c == '{') return parseObject(depth);
        if (c == '[') return parseArray(depth);
        if (c == '"') return Value(parseString());
        if (consume("true")) return Value(true);
        if (consume("false")) return Value(false);
        if (consume("null")) return Value();
        if (c == '-' || (c >= '0' && c <= '9')) return parseNumber();
        error("unexpected character");
    }

    Value parseObject(int depth) {
        Value obj = Value::object();
        pos_++;   // '{'
        skipSpace();
        if (pos_ < s_.size() && s_[pos_] == '}') { pos_++; return obj; }
        while (true) {
            skipSpace();
            if (pos_ >= s_.size() || s_[pos_] != '"') error("expected a property name");
            std::string key = parseString();
            skipSpace();
            if (pos_ >= s_.size() || s_[pos_] != ':') error("expected ':'");
            pos_++;
            obj[key] = parseValue(depth + 1);   // a repeated key keeps the last value, as in JavaScript
            skipSpace();
            if (pos_ < s_.size() && s_[pos_] == ',') { pos_++; continue; }
            if (pos_ < s_.size() && s_[pos_] == '}') { pos_++; return obj; }
            error("expected ',' or '}'");
        }
    }

    Value parseArray(int depth) {
        Value arr = Value::array();
        pos_++;   // '['
        skipSpace();
        if (pos_ < s_.size() && s_[pos_] == ']') { pos_++; return arr; }
        while (true) {
            arr.push(parseValue(depth + 1));
            skipSpace();
            if (pos_ < s_.size() && s_[pos_] == ',') { pos_++; continue; }
            if (pos_ < s_.size() && s_[pos_] == ']') { pos_++; return arr; }
            error("expected ',' or ']'");
        }
    }

    Value parseNumber() {
        size_t start = pos_;
        if (s_[pos_] == '-') pos_++;
        auto digits = [&] {
            size_t first = pos_;
            while (pos_ < s_.size() && s_[pos_] >= '0' && s_[pos_] <= '9') pos_++;
            if (pos_ == first) error("invalid number");
        };
        digits();
        if (pos_ < s_.size() && s_[pos_] == '.') { pos_++; digits(); }
        if (pos_ < s_.size() && (s_[pos_] == 'e' || s_[pos_] == 'E')) {
            pos_++;
            if (pos_ < s_.size() && (s_[pos_] == '+' || s_[pos_] == '-')) pos_++;
            digits();
        }
        return Value(std::strtod(s_.substr(start, pos_ - start).c_str(), nullptr));
    }

    unsigned hex4() {
        if (pos_ + 4 > s_.size()) error("incomplete \\u escape");
        unsigned value = 0;
        for (int i = 0; i < 4; i++) {
            char c = s_[pos_++];
            value <<= 4;
            if (c >= '0' && c <= '9') value |= c - '0';
            else if (c >= 'a' && c <= 'f') value |= c - 'a' + 10;
            else if (c >= 'A' && c <= 'F') value |= c - 'A' + 10;
            else error("invalid \\u escape");
        }
        return value;
    }

    static void appendUtf8(std::string& out, unsigned cp) {
        if (cp < 0x80) out += static_cast<char>(cp);
        else if (cp < 0x800) { out += static_cast<char>(0xC0 | (cp >> 6)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
        else if (cp < 0x10000) {
            out += static_cast<char>(0xE0 | (cp >> 12));
            out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
            out += static_cast<char>(0x80 | (cp & 0x3F));
        } else {
            out += static_cast<char>(0xF0 | (cp >> 18));
            out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
            out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
            out += static_cast<char>(0x80 | (cp & 0x3F));
        }
    }

    std::string parseString() {
        pos_++;   // opening quote
        std::string out;
        while (true) {
            if (pos_ >= s_.size()) error("unterminated string");
            char c = s_[pos_++];
            if (c == '"') return out;
            if (static_cast<unsigned char>(c) < 0x20) error("control character in string");
            if (c != '\\') { out += c; continue; }
            if (pos_ >= s_.size()) error("unterminated string");
            char e = s_[pos_++];
            switch (e) {
                case '"': out += '"'; break;
                case '\\': out += '\\'; break;
                case '/': out += '/'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case 'n': out += '\n'; break;
                case 'r': out += '\r'; break;
                case 't': out += '\t'; break;
                case 'u': {
                    unsigned cp = hex4();
                    if (cp >= 0xD800 && cp <= 0xDBFF && s_.compare(pos_, 2, "\\u") == 0) {
                        size_t save = pos_;
                        pos_ += 2;
                        unsigned low = hex4();
                        if (low >= 0xDC00 && low <= 0xDFFF) cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
                        else pos_ = save;
                    }
                    appendUtf8(out, cp);
                    break;
                }
                default: error("invalid escape");
            }
        }
    }

    const std::string& s_;
    size_t pos_ = 0;
};

}  // namespace

Value Value::parse(const std::string& text) { return Parser(text).parseDocument(); }

// ---------------------------------------------------------------- writing

namespace {

void writeString(std::string& out, const std::string& s) {
    out += '"';
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof buf, "\\u%04x", static_cast<unsigned char>(c));
                    out += buf;
                } else {
                    out += c;
                }
        }
    }
    out += '"';
}

void writeNumber(std::string& out, double n) {
    if (!std::isfinite(n)) { out += "null"; return; }
    if (n == std::floor(n) && std::fabs(n) < 9007199254740992.0) {
        out += std::to_string(static_cast<long long>(n));
        return;
    }
    char buf[32];
    auto result = std::to_chars(buf, buf + sizeof buf, n);   // shortest round-trip form
    out.append(buf, result.ptr);
}

void newline(std::string& out, int indent, int depth) {
    if (indent < 0) return;
    out += '\n';
    out.append(static_cast<size_t>(indent * depth), ' ');
}

}  // namespace

void Value::write(std::string& out, int indent, int depth) const {
    switch (type_) {
        case Type::Null: out += "null"; break;
        case Type::Bool: out += bool_ ? "true" : "false"; break;
        case Type::Number: writeNumber(out, number_); break;
        case Type::String: writeString(out, string_); break;
        case Type::Array:
        case Type::Object: {
            bool isObj = type_ == Type::Object;
            out += isObj ? '{' : '[';
            for (size_t i = 0; i < items_.size(); i++) {
                if (i) out += ',';
                newline(out, indent, depth + 1);
                if (isObj) {
                    writeString(out, keys_[i]);
                    out += indent < 0 ? ":" : ": ";
                }
                items_[i].write(out, indent, depth + 1);
            }
            if (!items_.empty()) newline(out, indent, depth);
            out += isObj ? '}' : ']';
            break;
        }
    }
}

std::string Value::dump(int indent) const {
    std::string out;
    write(out, indent, 0);
    return out;
}

}  // namespace json
