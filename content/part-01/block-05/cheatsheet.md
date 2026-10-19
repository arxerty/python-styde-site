# Шпаргалка: коллекции

| | list | tuple | dict | set |
|---|---|---|---|---|
| Запись | `[1, 2]` | `(1, 2)`, `(1,)` | `{"a": 1}` | `{1, 2}`, `set()` |
| Порядок | да | да | порядок вставки | нет |
| Изменяемый | да | нет | да | да |
| Повторы | да | да | ключи уникальны | нет |
| Доступ | `lst[i]` | `t[i]` | `d[key]`, `d.get(key)` | только `in` |
| `x in` | медленно | медленно | мгновенно (ключи) | мгновенно |

## Списки

```python norun
lst.append(x); lst.insert(i, x); lst.extend(seq)
lst.remove(x); lst.pop(); lst.pop(i); del lst[i]
lst.index(x); lst.count(x); len(lst); sum/min/max(lst)
copy = lst.copy()   # или lst[:]; b = a — НЕ копия!
```

Методы изменения возвращают `None`: никогда не пишите `lst = lst.append(x)`.

## Перебор и сортировка

```python norun
for i, x in enumerate(lst, start=1): ...
for a, b in zip(xs, ys, strict=True): ...
sorted(seq)                       # новый список
lst.sort()                        # на месте, None
sorted(words, key=len, reverse=True)
sorted(d, key=d.get, reverse=True) # ключи по значениям
max(words, key=len)
```

Сортировка стабильна; `zip` останавливается на кратчайшей.

## Кортежи и распаковка

```python norun
name, age = ("Ада", 36)
first, *rest = seq
_, city = pair
for name, score in pairs: ...
a, b = b, a
```

Кортежи сравниваются поэлементно — удобный ключ сортировки.

## Словари

```python norun
d[k] = v; d.get(k, default); k in d; del d[k]; d.pop(k, default)
d.update(other); merged = defaults | overrides
for k, v in d.items(): ...
counts[w] = counts.get(w, 0) + 1            # подсчёт
groups.setdefault(key, []).append(item)     # группировка
dict(zip(keys, values)); dict.fromkeys(seq) # уникальные с порядком
```

Ключи — неизменяемые (str, int, tuple).

## Множества

```python norun
a & b   a | b   a - b   a ^ b   a <= b   a.isdisjoint(b)
s.add(x); s.discard(x); s.remove(x)
set(seq)   # уникальные значения
```

## Вложенные структуры

```python norun
response["choices"][0]["message"]["content"]
data.get("usage", {}).get("total_tokens", 0)
import copy; copy.deepcopy(nested)
grid = [[0] * cols for _ in range(rows)]   # не [[0] * cols] * rows!
json.loads(text); json.dumps(data, ensure_ascii=False)
```

## Comprehensions

```python norun
[f(x) for x in seq]                 # преобразование
[x for x in seq if cond]            # фильтр
[a if cond else b for x in seq]     # выбор значения
{k: v for k, v in d.items()}        # словарь
{x for x in seq}                    # множество
sum(x * x for x in seq)             # генераторное выражение
[v for row in matrix for v in row]  # сплющивание
list(zip(*matrix))                  # транспонирование
```

## Частые ошибки

- `b = a` вместо копии; поверхностная копия вложенных данных.
- `{}` — пустой словарь, а не множество.
- `KeyError` при `d[k]` — используйте `get`.
- `else` в фильтре comprehension.
- Удаление из списка во время его перебора.
