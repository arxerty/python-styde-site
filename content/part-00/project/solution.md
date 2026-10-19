# Эталонное решение

```python
def calc(a, op, b):
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op == "*":
        return a * b
    if op == "/":
        return None if b == 0 else a / b
    return None


print(calc(2, "+", 3))
print(calc(1, "/", 0))
```

**Разбор.** Ранний `return` в каждой ветке избавляет от вложенных `else`. Деление на ноль обрабатываем до операции, а не ловим исключение — так проще читать.
