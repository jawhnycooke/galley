# Display math

The mass-energy equivalence, with a blank line above it:

$$
E = mc^2
$$

Nothing inside a block is markdown. The underscores, the asterisks and the backticks below are TeX, and every one of them would be emphasis or a code span if this were prose:

$$
a_1 * b_2 * c_3 = \sum_{i=1}^{n} `x_i`
$$

A block whose body is empty still has a body of no lines:

$$
$$

Inside a blockquote:

> $$
> \alpha + \beta
> $$

Inside a list item, where the container's own indentation is not the block's:

- a bullet with prose
  $$
  \gamma
  $$
- another bullet

A doubled dollar that is not a delimiter stays prose: it costs $$5 and the line goes on, and `$$` inside a code span is a code span.

```sh
# and a $$ inside a fence is a fence's own text
echo "$$"
```
