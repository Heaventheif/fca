export class Command {
  
  constructor(name, options = {}) {
    this.name        = name.toLowerCase();
    this.description = options.description ?? 'No description provided.';
    this.usage       = options.usage       ?? `/${name}`;
    this.aliases     = (options.aliases ?? []).map((a) => a.toLowerCase());
    this.category    = options.category    ?? 'general';
    this.permissions = options.permissions ?? [];
    this.cooldownMs  = options.cooldownMs  ?? 0;
    this.dmOnly      = options.dmOnly      ?? false;
    this.groupOnly   = options.groupOnly   ?? false;
    this.ownerOnly   = options.ownerOnly   ?? false;
    this.hidden      = options.hidden      ?? false;
    this.minArgs     = options.minArgs     ?? 0;
    this.maxArgs     = options.maxArgs     ?? Infinity;
    this.args        = options.args        ?? [];
    this.handler     = options.handler     ?? null;
    this.enabled     = options.enabled     !== false;

    this.subcommands  = new Map();  
    this.stats        = { used: 0, errors: 0, lastUsedAt: 0 };
    this._cooldownMap = new Map();  
  }

  

  
  addSubcommand(subcommand) {
    if (subcommand instanceof Command) {
      this.subcommands.set(subcommand.name, subcommand);
      for (const alias of subcommand.aliases) {
        this.subcommands.set(alias, subcommand);
      }
    }
    return this;
  }

  
  setHandler(fn) {
    this.handler = fn;
    return this;
  }

  

  
  checkGuards(senderID, roles = [], context = {}) {
    if (!this.enabled)
      return 'This command is currently disabled.';

    if (this.ownerOnly && !roles.includes('owner'))
      return 'This command is for owners only.';

    if (this.dmOnly && context.isGroup)
      return 'This command can only be used in DMs.';

    if (this.groupOnly && !context.isGroup)
      return 'This command can only be used in group chats.';

    if (
      this.permissions.length > 0 &&
      !this.permissions.some((p) => roles.includes(p))
    ) {
      return `Missing permission: ${this.permissions.join(', ')}`;
    }

    if (this.cooldownMs > 0) {
      const lastUsed    = this._cooldownMap.get(senderID) ?? 0;
      const remaining   = this.cooldownMs - (Date.now() - lastUsed);
      if (remaining > 0)
        return `Cooldown: please wait ${Math.ceil(remaining / 1000)}s before using /${this.name} again.`;
    }

    return null;
  }

  

  
  recordUse(senderID) {
    this.stats.used++;
    this.stats.lastUsedAt = Date.now();
    if (this.cooldownMs > 0) this._cooldownMap.set(senderID, Date.now());
  }

  
  recordError() {
    this.stats.errors++;
  }

  

  
  validateArgs(args) {
    if (args.length < this.minArgs) {
      return {
        valid: false,
        error: `Requires at least ${this.minArgs} argument(s). Usage: ${this.usage}`,
      };
    }

    if (args.length > this.maxArgs && this.maxArgs !== Infinity) {
      return {
        valid: false,
        error: `Accepts at most ${this.maxArgs} argument(s). Usage: ${this.usage}`,
      };
    }

    for (let i = 0; i < this.args.length && i < args.length; i++) {
      const argDef = this.args[i];

      if (argDef.type === 'number' && Number.isNaN(Number(args[i]))) {
        return { valid: false, error: `Argument '${argDef.name}' must be a number.` };
      }

      if (
        argDef.type === 'boolean' &&
        !['true', 'false', '1', '0'].includes(String(args[i]).toLowerCase())
      ) {
        return { valid: false, error: `Argument '${argDef.name}' must be true/false.` };
      }
    }

    return { valid: true };
  }

  
  toJSON() {
    return {
      name:        this.name,
      description: this.description,
      usage:       this.usage,
      aliases:     this.aliases,
      category:    this.category,
      cooldownMs:  this.cooldownMs,
      ownerOnly:   this.ownerOnly,
      dmOnly:      this.dmOnly,
      groupOnly:   this.groupOnly,
      hidden:      this.hidden,
      stats:       this.stats,
    };
  }
}

export class CommandRegistry {
  
  constructor(options = {}) {
    this.prefix        = options.prefix        ?? '/';
    this.caseSensitive = options.caseSensitive  ?? false;
    this.ownerIDs      = new Set(options.ownerIDs ?? []);
    this._commands     = new Map(); 
  }

  

  
  register(command) {
    if (!(command instanceof Command))
      throw new TypeError('Expected a Command instance');

    this._commands.set(command.name, command);
    for (const alias of command.aliases) {
      this._commands.set(alias, command);
    }
    return this;
  }

  
  unregister(name) {
    const command = this._commands.get(name.toLowerCase());
    if (!command) return false;

    this._commands.delete(command.name);
    for (const alias of command.aliases) {
      this._commands.delete(alias);
    }
    return true;
  }

  

  
  parse(text) {
    if (!text) return null;

    const normalizedText   = this.caseSensitive ? text   : text.toLowerCase();
    const normalizedPrefix = this.caseSensitive ? this.prefix : this.prefix.toLowerCase();

    if (!normalizedText.startsWith(normalizedPrefix)) return null;

    const parts       = normalizedText.slice(normalizedPrefix.length).trim().split(/\s+/);
    const commandName = parts[0];
    if (!commandName) return null;

    const command = this._commands.get(commandName);
    if (!command) return null;

    let args       = parts.slice(1);
    let subcommand = null;

    if (args.length > 0 && command.subcommands.has(args[0])) {
      subcommand = command.subcommands.get(args[0]);
      args       = args.slice(1);
    }

    return { command, subcommand, args };
  }

  

  
  async dispatch(text, context, extraRoles = []) {
    const parsed = this.parse(text);
    if (!parsed) return false;

    const target         = parsed.subcommand ?? parsed.command;
    // Support both MessengerContext instances (ctx.isGroup getter) and plain event objects
    const senderID = context.senderID ?? context.event?.senderID;
    const isGroup  = context.isGroup  ?? context.event?.isGroup ?? false;

    
    const roles = [...extraRoles];
    if (this.ownerIDs.has(senderID)) roles.push('owner');

    
    const guardError = target.checkGuards(senderID, roles, { isGroup });
    if (guardError) {
      if (context.api?.sendMessage) await context.api.sendMessage(guardError, context.threadID);
      return true;
    }

    
    const argCheck = target.validateArgs(parsed.args);
    if (!argCheck.valid) {
      if (context.api?.sendMessage) await context.api.sendMessage(argCheck.error, context.threadID);
      return true;
    }

    
    try {
      target.recordUse(senderID);
      await target.handler?.({ ...context, args: parsed.args, command: target });
    } catch (err) {
      target.recordError();
      throw err;
    }

    return true;
  }

  

  
  get(name) {
    return this._commands.get(this.caseSensitive ? name : name.toLowerCase()) ?? null;
  }

  
  list() {
    const seen = new Set();
    return Array.from(this._commands.values()).filter((cmd) => {
      if (seen.has(cmd.name)) return false;
      seen.add(cmd.name);
      return true;
    });
  }

  
  listPublic() {
    return this.list().filter((cmd) => !cmd.hidden && cmd.enabled);
  }

  
  byCategory() {
    const categories = {};
    for (const cmd of this.list()) {
      (categories[cmd.category] = categories[cmd.category] ?? []).push(cmd);
    }
    return categories;
  }

  
  stats() {
    const commands = this.list();
    return {
      total:       commands.length,
      totalUses:   commands.reduce((sum, c) => sum + c.stats.used,   0),
      totalErrors: commands.reduce((sum, c) => sum + c.stats.errors, 0),
      topCommands: [...commands]
        .sort((a, b) => b.stats.used - a.stats.used)
        .slice(0, 10)
        .map((c) => ({ name: c.name, uses: c.stats.used })),
    };
  }
}

export function createCommandRegistry(options) {
  return new CommandRegistry(options);
}

export default { Command, CommandRegistry, createCommandRegistry };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-command-registry',
  meta: { category: 'command', path: 'lib/command/registry.js' },
  setup(_ctx) {
    // provides: Command, CommandRegistry, createCommandRegistry
  },
};
