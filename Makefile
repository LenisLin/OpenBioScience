
cat-config:
	@base64 -D -i ~/.deeporganiser-config-dev/deeporganiser-config.txt | python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read()))' | pbcopy
