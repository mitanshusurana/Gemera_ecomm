const fs = require('fs');

function replaceFile(path, search, replacement) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(search, replacement);
  fs.writeFileSync(path, content, 'utf8');
}

// 1. ContactComponent
replaceFile('src/app/pages/contact.ts',
  "import { OnInit } from '@angular/core';\nimport { SettingService } from '../services/setting.service';\n\nexport class ContactComponent implements OnInit {",
  "export class ContactComponent implements OnInit {"
);

replaceFile('src/app/pages/contact.ts',
  "import { Component } from '@angular/core';",
  "import { Component, OnInit } from '@angular/core';\nimport { SettingService } from '../services/setting.service';"
);

replaceFile('src/app/pages/contact.ts',
  "next: (data) => {",
  "next: (data: any) => {"
);

// 2. HomeComponent
replaceFile('src/app/pages/home.ts',
  "    WhatsappButtonComponent,\n",
  ""
);

replaceFile('src/app/pages/home.ts',
  "import { WhatsappButtonComponent } from \"../components/whatsapp-button\";\n",
  ""
);

replaceFile('src/app/pages/home.ts',
  "    <!-- WhatsApp Button -->\n    <app-whatsapp-button></app-whatsapp-button>\n",
  "\n"
);

// 3. WhatsappButtonComponent
replaceFile('src/app/components/whatsapp-button.ts',
  "import { OnInit, ChangeDetectorRef } from '@angular/core';\nimport { SettingService } from '../services/setting.service';\n\nexport class WhatsappButtonComponent implements OnInit {",
  "export class WhatsappButtonComponent implements OnInit {"
);

replaceFile('src/app/components/whatsapp-button.ts',
  "import { Component, Input, ChangeDetectionStrategy } from \"@angular/core\";",
  "import { Component, Input, ChangeDetectionStrategy, OnInit, ChangeDetectorRef } from \"@angular/core\";\nimport { SettingService } from '../services/setting.service';"
);

replaceFile('src/app/components/whatsapp-button.ts',
  "next: (data) => {",
  "next: (data: any) => {"
);

// 4. FooterComponent
replaceFile('src/app/components/footer.ts',
  "import { SettingService } from '../services/setting.service';\n\nexport class FooterComponent {",
  "export class FooterComponent implements OnInit {"
);

replaceFile('src/app/components/footer.ts',
  "import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef } from \"@angular/core\";",
  "import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from \"@angular/core\";\nimport { SettingService } from '../services/setting.service';"
);

replaceFile('src/app/components/footer.ts',
  "next: (data) => {",
  "next: (data: any) => {"
);

// Fixes
replaceFile('src/app/components/footer.ts',
  "    <!-- WhatsApp Button -->\n    <app-whatsapp-button></app-whatsapp-button>\n  `,\n})\nexport class FooterComponent implements OnInit {",
  "  `,\n})\nexport class FooterComponent implements OnInit {"
);

replaceFile('src/app/components/footer.ts',
  "    <app-whatsapp-button></app-whatsapp-button>\n  `,\n})\nexport class FooterComponent implements OnInit {",
  "  `,\n})\nexport class FooterComponent implements OnInit {"
);

replaceFile('src/app/components/footer.ts',
  "imports: [CommonModule, WhatsappButtonComponent, RouterLink, FormsModule],",
  "imports: [CommonModule, RouterLink, FormsModule],"
);

replaceFile('src/app/components/footer.ts',
  "import { WhatsappButtonComponent } from \"./whatsapp-button\";\n",
  ""
);
