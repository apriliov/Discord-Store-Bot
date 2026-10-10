// Prefix command support.
// Every slash command is also usable with a prefix (default "!"). The message is turned into an object that
// behaves like a ChatInputCommandInteraction, so each command only has to be written once.
//
// Syntax:   !command [subcommand] value1 value2 ...
//   - Values are filled in the same order as the slash options.
//   - Use "quotes" for values with spaces. The last text value can contain spaces without quotes.
//   - Any option can also be given by name:  !post #news color:#ff0000 title:"Big sale" Hello everyone!
//   - Attach a file to the message for attachment options (for example the image of /post).
const config = require('../config');
const embeds = require('../utils/embeds');

const T = { SUB: 1, GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6, CHANNEL: 7, ROLE: 8, NUMBER: 10, ATTACHMENT: 11 };
const TRUE_WORDS = ['true', 'yes', 'y', 'on', '1'];
const FALSE_WORDS = ['false', 'no', 'n', 'off', '0'];

class PrefixError extends Error {}

function usageOf(name, json, sub) {
  const opts = (sub ? sub.options : json.options) || [];
  const real = opts.filter((o) => o.type !== T.SUB && o.type !== T.GROUP);
  const parts = real.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`));
  if (!sub && json.options && json.options[0] && json.options[0].type === T.SUB) {
    return `${config.prefix}${name} <${json.options.map((s) => s.name).join('|')}> ...`;
  }
  return `${config.prefix}${name}${sub ? ` ${sub.name}` : ''}${parts.length ? ` ${parts.join(' ')}` : ''}`;
}

function tokenize(raw, names) {
  const tokens = [];
  const spans = [];
  const re = /([a-z][a-z0-9-]*):"([^"]*)"|([a-z][a-z0-9-]*):(\S+)|"([^"]*)"|(\S+)/gi;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index;
    const end = start + m[0].length;
    if (m[1] && names.has(m[1].toLowerCase())) {
      tokens.push({ named: m[1].toLowerCase(), value: m[2], start, end });
      spans.push([start, end]);
    } else if (m[3] && names.has(m[3].toLowerCase())) {
      tokens.push({ named: m[3].toLowerCase(), value: m[4], start, end });
      spans.push([start, end]);
    } else if (m[5] !== undefined) {
      tokens.push({ named: null, value: m[5], start, end, quoted: true });
    } else {
      tokens.push({ named: null, value: m[0], start, end });
    }
  }
  return { tokens, spans };
}

function remainderFrom(raw, start, spans) {
  let out = '';
  let pos = start;
  for (const [s, e] of spans.filter(([s]) => s >= start)) {
    out += raw.slice(pos, s);
    pos = e;
  }
  out += raw.slice(pos);
  out = out.trim();
  const quoted = out.match(/^"([^"]*)"$/);
  return quoted ? quoted[1] : out;
}

const idFrom = (token, pattern) => {
  const m = String(token).match(pattern);
  if (m) return m[1];
  return /^\d{17,20}$/.test(token) ? token : null;
};

async function convert(message, opt, token) {
  switch (opt.type) {
    case T.STRING: {
      let value = token;
      if (opt.choices) {
        const hit = opt.choices.find((c) => String(c.value).toLowerCase() === value.toLowerCase() || c.name.toLowerCase() === value.toLowerCase());
        if (!hit) throw new PrefixError(`\`${opt.name}\` must be one of: ${opt.choices.map((c) => c.value).join(', ')}.`);
        return hit.value;
      }
      if (opt.max_length && value.length > opt.max_length) throw new PrefixError(`\`${opt.name}\` is too long (max ${opt.max_length} characters).`);
      if (opt.min_length && value.length < opt.min_length) throw new PrefixError(`\`${opt.name}\` is too short (min ${opt.min_length} characters).`);
      return value;
    }
    case T.INTEGER:
    case T.NUMBER: {
      if (opt.choices) {
        const hit = opt.choices.find((c) => String(c.value) === token);
        if (!hit) throw new PrefixError(`\`${opt.name}\` must be one of: ${opt.choices.map((c) => c.value).join(', ')}.`);
        return hit.value;
      }
      const n = Number(token.replace(/[.,](?=\d{3}(\D|$))/g, ''));
      if (!Number.isFinite(n) || (opt.type === T.INTEGER && !Number.isInteger(n))) {
        throw new PrefixError(`\`${opt.name}\` must be ${opt.type === T.INTEGER ? 'a whole number' : 'a number'}.`);
      }
      if (opt.min_value !== undefined && n < opt.min_value) throw new PrefixError(`\`${opt.name}\` must be at least ${opt.min_value}.`);
      if (opt.max_value !== undefined && n > opt.max_value) throw new PrefixError(`\`${opt.name}\` must be at most ${opt.max_value}.`);
      return n;
    }
    case T.BOOLEAN: {
      const w = token.toLowerCase();
      if (TRUE_WORDS.includes(w)) return true;
      if (FALSE_WORDS.includes(w)) return false;
      throw new PrefixError(`\`${opt.name}\` must be true or false.`);
    }
    case T.USER: {
      const id = idFrom(token, /^<@!?(\d+)>$/);
      const user = id ? await message.client.users.fetch(id).catch(() => null) : null;
      if (!user) throw new PrefixError(`I could not find that user for \`${opt.name}\`. Use a mention or a user ID.`);
      return user;
    }
    case T.ROLE: {
      const id = idFrom(token, /^<@&(\d+)>$/);
      const role = id ? await message.guild.roles.fetch(id).catch(() => null) : null;
      if (!role) throw new PrefixError(`I could not find that role for \`${opt.name}\`. Use a mention or a role ID.`);
      return role;
    }
    case T.CHANNEL: {
      const id = idFrom(token, /^<#(\d+)>$/);
      const channel = id ? await message.guild.channels.fetch(id).catch(() => null) : null;
      if (!channel) throw new PrefixError(`I could not find that channel for \`${opt.name}\`. Use a mention or a channel ID.`);
      if (opt.channel_types && !opt.channel_types.includes(channel.type)) throw new PrefixError(`That channel type is not allowed for \`${opt.name}\`.`);
      return channel;
    }
    default:
      throw new PrefixError(`Unsupported option type for \`${opt.name}\`.`);
  }
}

async function parseArgs(message, name, json, rest) {
  let opts = json.options || [];
  let sub = null;

  if (opts.length && opts[0].type === T.SUB) {
    const m = rest.match(/^\s*(\S+)([\s\S]*)$/);
    const word = m ? m[1].toLowerCase() : '';
    sub = opts.find((s) => s.name === word);
    if (!sub) throw new PrefixError(`Please choose a subcommand: ${opts.map((s) => `\`${s.name}\``).join(', ')}.\nUsage: \`${usageOf(name, json, null)}\``);
    rest = m[2].trimStart();
    opts = sub.options || [];
  }

  const names = new Set(opts.map((o) => o.name));
  const { tokens, spans } = tokenize(rest, names);
  const values = new Map();

  for (const t of tokens.filter((x) => x.named)) {
    const opt = opts.find((o) => o.name === t.named);
    if (opt.type === T.ATTACHMENT) continue;
    if (!values.has(opt.name)) values.set(opt.name, await convert(message, opt, t.value));
  }

  const positional = tokens.filter((t) => !t.named);
  let idx = 0;
  const unset = opts.filter((o) => !values.has(o.name) && o.type !== T.ATTACHMENT);

  for (let i = 0; i < unset.length; i += 1) {
    const opt = unset[i];
    if (idx >= positional.length) break;
    const laterRequired = unset.slice(i + 1).some((o) => o.required);
    const laterOnlyText = unset.slice(i + 1).every((o) => o.type === T.STRING && !o.choices);
    const takesRest =
      opt.type === T.STRING && !opt.choices && !laterRequired && !positional[idx].quoted && (opt.required || laterOnlyText);
    const token = takesRest ? remainderFrom(rest, positional[idx].start, spans) : positional[idx].value;
    idx = takesRest ? positional.length : idx + 1;
    values.set(opt.name, await convert(message, opt, token));
  }

  const files = [...message.attachments.values()];
  for (const opt of opts.filter((o) => o.type === T.ATTACHMENT)) {
    const file = files.shift();
    if (file) values.set(opt.name, file);
  }

  for (const opt of opts) {
    if (opt.required && !values.has(opt.name)) {
      throw new PrefixError(opt.type === T.ATTACHMENT ? `Please attach a file for \`${opt.name}\`.` : `Missing required value \`${opt.name}\`.`);
    }
  }
  return { sub, values, usage: usageOf(name, json, sub) };
}

const stripFlags = (payload) => {
  const data = typeof payload === 'string' ? { content: payload } : { ...payload };
  delete data.flags;
  delete data.ephemeral;
  if (!data.allowedMentions) data.allowedMentions = { parse: [], repliedUser: false };
  return data;
};

class PrefixInteraction {
  constructor(message, commandName, sub, values) {
    this.message = message;
    this.client = message.client;
    this.commandName = commandName;
    this.guild = message.guild;
    this.guildId = message.guild.id;
    this.channel = message.channel;
    this.channelId = message.channel.id;
    this.member = message.member;
    this.user = message.author;
    this.deferred = false;
    this.replied = false;
    this._reply = null;

    const get = (name) => (values.has(name) ? values.get(name) : null);
    this.options = {
      getSubcommand: () => (sub ? sub.name : null),
      getString: get,
      getInteger: get,
      getNumber: get,
      getBoolean: get,
      getUser: get,
      getRole: get,
      getChannel: get,
      getAttachment: get,
    };
  }

  inGuild() {
    return true;
  }

  async _send(data) {
    try {
      return await this.message.reply(data);
    } catch {
      return this.channel.send(data);
    }
  }

  async deferReply() {
    this.deferred = true;
    this.channel.sendTyping().catch(() => {});
  }

  async reply(payload) {
    this.replied = true;
    this._reply = await this._send(stripFlags(payload));
    return this._reply;
  }

  async editReply(payload) {
    const data = stripFlags(payload);
    if (this._reply) return this._reply.edit(data);
    this.replied = true;
    this._reply = await this._send(data);
    return this._reply;
  }

  async followUp(payload) {
    return this.channel.send(stripFlags(payload));
  }
}

async function runPrefixCommand(client, message, command, rest) {
  const name = command.data.name;
  const json = command.data.toJSON();
  let parsed;
  try {
    parsed = await parseArgs(message, name, json, rest);
  } catch (err) {
    if (err instanceof PrefixError) {
      const usage = usageOf(name, json, null);
      return message.reply({ embeds: [embeds.error(`${err.message}\nUsage: \`${usage}\``)], allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
    }
    throw err;
  }

  const interaction = new PrefixInteraction(message, name, parsed.sub, parsed.values);
  try {
    await command.execute(interaction, client);
  } catch (err) {
    if (err && (err.code === 10062 || err.code === 40060)) return;
    console.error(`[PREFIX] ${config.prefix}${name} failed:`, err);
    await message.reply({ embeds: [embeds.error('Something went wrong while running that command.')], allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  }
}

module.exports = { runPrefixCommand, PrefixError, parseArgs };
