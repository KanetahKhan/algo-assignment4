// SafeRoute — minimal JSON value, reader and writer.
//
// Support code only: it loads scenario files and prints results. None of the
// evacuation algorithms live here (see algorithms.hpp for those).
#pragma once

#include <string>
#include <vector>

namespace json {

class Value {
public:
    enum class Type { Null, Bool, Number, String, Array, Object };

    Value() = default;                       // null
    Value(std::nullptr_t) {}
    Value(bool b) : type_(Type::Bool), bool_(b) {}
    Value(int n) : type_(Type::Number), number_(n) {}
    Value(long long n) : type_(Type::Number), number_(static_cast<double>(n)) {}
    Value(double n) : type_(Type::Number), number_(n) {}
    Value(const char* s) : type_(Type::String), string_(s) {}
    Value(std::string s) : type_(Type::String), string_(std::move(s)) {}

    static Value array();
    static Value object();
    static Value parse(const std::string& text);   // throws std::runtime_error

    Type type() const { return type_; }
    bool isNull() const { return type_ == Type::Null; }
    bool isBool() const { return type_ == Type::Bool; }
    bool isNumber() const { return type_ == Type::Number; }
    bool isString() const { return type_ == Type::String; }
    bool isArray() const { return type_ == Type::Array; }
    bool isObject() const { return type_ == Type::Object; }

    bool asBool() const { return bool_; }
    double asNumber() const { return number_; }
    const std::string& asString() const { return string_; }

    // Arrays
    const std::vector<Value>& items() const { return items_; }
    std::vector<Value>& items() { return items_; }
    void push(Value v) { items_.push_back(std::move(v)); }

    // Objects keep their keys in insertion order, like JavaScript objects.
    const Value* find(const std::string& key) const;   // nullptr when missing
    Value& operator[](const std::string& key);          // inserts null when missing
    const std::vector<std::string>& keys() const { return keys_; }

    // indent < 0 prints compact JSON; indent >= 0 pretty-prints.
    std::string dump(int indent = -1) const;

private:
    void write(std::string& out, int indent, int depth) const;

    Type type_ = Type::Null;
    bool bool_ = false;
    double number_ = 0;
    std::string string_;
    std::vector<Value> items_;           // array elements, or object values
    std::vector<std::string> keys_;      // object keys (parallel to items_)
};

}  // namespace json
