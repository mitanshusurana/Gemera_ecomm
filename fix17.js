const fs = require('fs');

function replaceFile(path, search, replacement) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(search, replacement);
  fs.writeFileSync(path, content, 'utf8');
}


replaceFile('src/app/app.ts',
  "import { ChatWidgetComponent } from './components/chat-widget';",
  "import { ChatWidgetComponent } from './components/chat-widget';\nimport { WhatsappButtonComponent } from './components/whatsapp-button';"
);

replaceFile('src/app/app.ts',
  "imports: [RouterOutlet, HeaderComponent, FooterComponent, ToastContainerComponent, ChatWidgetComponent],",
  "imports: [RouterOutlet, HeaderComponent, FooterComponent, ToastContainerComponent, ChatWidgetComponent, WhatsappButtonComponent],"
);

replaceFile('src/app/app.ts',
  "    <app-footer></app-footer>\n    <app-toast-container></app-toast-container>\n    <app-chat-widget></app-chat-widget>\n  `\n})",
  "    <app-footer></app-footer>\n    <app-toast-container></app-toast-container>\n    <app-chat-widget></app-chat-widget>\n    <app-whatsapp-button></app-whatsapp-button>\n  `\n})"
);
