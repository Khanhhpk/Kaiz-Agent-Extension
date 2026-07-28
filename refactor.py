import sys
import re

html = open('kaiz_window.html', 'r', encoding='utf-8').read()

# Extract the chat contents (lines 8 to 126 roughly)
chat_pattern = re.compile(r'(<dialog id="kaiz-chat-window" class="kaiz-chat-window">\n)(.*?)(</dialog>\n\n<!-- Persona)', re.DOTALL)
chat_match = chat_pattern.search(html)

if not chat_match:
    print('Could not find chat window')
    sys.exit(1)

chat_content = chat_match.group(2)

# Extract the browser contents
browser_pattern = re.compile(r'<!-- Browser Modal -->\n<dialog\n    id="kaiz-browser-modal"\n    class="kaiz-modal kaiz-browser-modal"\n>\n    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden;">\n(.*?)\n    </div>\n</dialog>\n', re.DOTALL)
browser_match = browser_pattern.search(html)

if not browser_match:
    print('Could not find browser modal')
    sys.exit(1)

browser_content = browser_match.group(1)

new_dialog_content = f'''<dialog id="kaiz-chat-window" class="kaiz-chat-window">
    <div id="kaiz-browser-container" class="kaiz-browser-container" style="display: none; flex-direction: column; flex: 1; min-width: 0; overflow: hidden; position: relative;">
{browser_content}
    </div>
    <div id="kaiz-chat-container" class="kaiz-chat-container" style="display: flex; flex-direction: column; flex: 1; min-width: 0; position: relative; height: 100%;">
{chat_content}    </div>
</dialog>

<!-- Persona'''

new_html = html[:chat_match.start()] + new_dialog_content + html[chat_match.end():browser_match.start()]

with open('kaiz_window.html', 'w', encoding='utf-8') as f:
    f.write(new_html)
print('DOM refactored successfully.')
