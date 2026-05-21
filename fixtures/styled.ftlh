<#assign name = "World" />
<!DOCTYPE html>
<html>
<head>
<style>
.greeting { color: red; font-size: 14px; }
@media (prefers-color-scheme: dark) {
  .greeting { color: white; }
}
</style>
</head>
<body>
<p class="greeting">Hello, ${name}!</p>
</body>
</html>
