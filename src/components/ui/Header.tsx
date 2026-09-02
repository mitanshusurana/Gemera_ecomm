import { Bell, Search, User } from 'lucide-react';

export default function Header() {
  return (
    <header className="h-16 bg-surface/80 backdrop-blur-md border-b border-border flex items-center justify-between px-8 sticky top-0 z-40">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textSecondary group-focus-within:text-primary transition-colors" />
          <input 
            type="text"
            placeholder="Search transactions, inventory..."
            className="w-full bg-background border border-border rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder:text-textSecondary focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-6">
        <button className="relative text-textSecondary hover:text-white transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-danger rounded-full border border-surface"></span>
        </button>
        
        <div className="flex items-center gap-3 pl-6 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50 text-primary">
            <User className="w-4 h-4" />
          </div>
          <div className="hidden md:block text-sm">
            <p className="text-white font-medium">Admin User</p>
            <p className="text-xs text-textSecondary">Super Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
