const res = await fetch('http://localhost:5173/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Test', storyContext: 'ctx', userPrompt: '' }),
});

const text = await res.text();
console.log(res.status);
console.log(text);

process.exit(res.ok ? 0 : 1);
