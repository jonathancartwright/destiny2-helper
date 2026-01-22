# Destiny 2 Vault Curator

An MCP (Model Context Protocol) server for intelligent Destiny 2 vault management. This tool helps you clean up your vault without accidentally dismantling items used in your DIM builds.

## Features

- **Build-Safe Cleanup**: Import your DIM backup to protect items used in loadouts
- **Armor Scoring**: Analyze armor pieces with stat-based scoring for different build types
- **Duplicate Detection**: Find duplicate weapons and armor with recommendations on which to keep
- **Smart Recommendations**: Get KEEP/REVIEW/JUNK recommendations with clear reasoning
- **Item Transfers**: Move items between vault and characters (requires OAuth)
- **Batch Operations**: Move all junk items to one character for quick dismantling

## What This Tool CAN Do

| Capability | Description |
|------------|-------------|
| Read inventory | Fetch all items from vault and characters |
| Analyze armor | Score armor based on stat distributions |
| Find duplicates | Identify duplicate items and recommend which to keep |
| Generate cleanup plans | Create safe dismantle lists respecting DIM builds |
| Transfer items | Move items between vault and characters |
| Lock/unlock items | Change item lock state |
| Protect DIM loadouts | Never recommend dismantling build-critical items |

## What This Tool CANNOT Do

| Limitation | Reason |
|------------|--------|
| Dismantle items | Bungie API does not support dismantling |
| Equip items | Requires in-game action |
| Modify DIM loadouts | DIM data is read-only import |

## Installation

```bash
# Clone or download the repository
cd destiny2-vault-curator

# Install dependencies
npm install

# Build
npm run build
```

## Setup

### 1. Get a Bungie API Key

1. Go to [bungie.net/developer](https://www.bungie.net/en/Application)
2. Create a new application
3. Copy your API Key

### 2. (Optional) Set Up OAuth for Write Operations

For transferring items, you'll need OAuth tokens. The simplest approach:

1. Use [DIM](https://destinyitemmanager.com) or another OAuth-enabled tool
2. Extract the tokens from your browser's developer tools
3. Or implement the OAuth flow (see Bungie API documentation)

### 3. Export Your DIM Backup

1. Open [DIM](https://destinyitemmanager.com)
2. Go to Settings > Storage
3. Click "Export backup to file"
4. Save the JSON file

### 4. Configure Claude Desktop

Add to your Claude Desktop `config.json`:

```json
{
  "mcpServers": {
    "destiny2": {
      "command": "node",
      "args": ["/path/to/destiny2-vault-curator/dist/index.js"]
    }
  }
}
```

## Usage

### Initial Setup

```
You: Configure my Destiny 2 vault curator

Claude: I'll set up the Bungie API connection.
[Uses destiny_configure with your API key]

You: Load my DIM backup from ~/Downloads/dim-backup.json

Claude: I'll import your DIM data for build protection.
[Uses destiny_load_dim_backup]
Loaded 15 loadouts with 120 protected items.
```

### Fetch Inventory

```
You: Show me my vault contents

Claude: [Uses destiny_get_inventory and destiny_vault_summary]
Your vault has 487/600 items (81% full):
- 234 weapons
- 241 armor pieces
- 12 other items
```

### Generate Cleanup Plan

```
You: Help me clean up my vault

Claude: [Uses destiny_generate_cleanup_plan]

Cleanup Plan Summary:
- Keep: 312 items (protected or high quality)
- Review: 89 items (need manual decision)
- Junk: 86 items (safe to dismantle)

Protected items include:
- 120 items in DIM loadouts
- 45 masterworked items
- 23 locked items
- 8 exotic items
```

### Analyze Specific Armor

```
You: How good is my helmet with ID 6917529827132456?

Claude: [Uses destiny_analyze_armor]

Celestial Nighthawk (Helmet - Hunter)
Overall Score: 78/100
Total Stats: 67

Stats: M12 R8 Rc18 D15 I6 S8
✓ Spike: Recovery (18)
Best for: PvP Hunter (16.2)

This is a high-quality piece, especially for recovery-focused builds.
```

### Find Duplicates

```
You: Show me duplicate armor pieces

Claude: [Uses destiny_find_duplicates]

Found 23 duplicate groups:

1. Falling Star (Chest Armor) - 4 copies
   KEEP: Instance 123... [68 stats, MW]
   DISCARD: Instance 456... [58 stats]
   REVIEW: Instance 789... [65 stats, locked]

2. Lunafaction Boots - 3 copies
   ...
```

### Check Build Safety

```
You: Is it safe to dismantle item 6917529827132789?

Claude: [Uses destiny_check_build_safety]

Item: Radiant Dance Machines
Safe to dismantle: NO

Reasons:
- Used in DIM loadout: "Crucible Speed Build"
- Has DIM note: "great with arc subclass"
```

### Move Junk to Character

```
You: Move all the junk items to my Titan for dismantling

Claude: [Uses destiny_move_junk_to_character]

Moved 10 items to your Titan:
- Bad Juju [success]
- Blue armor piece [success]
- Another weapon [success]
...

Login to Destiny 2 on your Titan to dismantle these items.
```

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `destiny_configure` | Set up Bungie API connection |
| `destiny_load_dim_backup` | Import DIM backup for build protection |
| `destiny_dim_summary` | View loaded DIM data |
| `destiny_get_inventory` | Fetch full inventory |
| `destiny_vault_summary` | Get vault statistics |
| `destiny_get_characters` | List all characters |
| `destiny_analyze_armor` | Score an armor piece |
| `destiny_find_duplicates` | Find duplicate items |
| `destiny_compare_armor` | Compare two armor pieces |
| `destiny_generate_cleanup_plan` | Create cleanup recommendations |
| `destiny_get_junk_items` | List junk items from plan |
| `destiny_transfer_item` | Move item between locations |
| `destiny_move_junk_to_character` | Batch move junk items |
| `destiny_set_item_locked` | Lock/unlock an item |
| `destiny_search_items` | Search inventory |
| `destiny_check_build_safety` | Verify item is safe to dismantle |

## Protection Rules

By default, the following items are protected from junk recommendations:

1. **DIM Loadout Items** - Any item in a DIM loadout
2. **Locked Items** - Items locked in-game
3. **Masterworked Items** - Fully masterworked items
4. **Exotic Items** - All exotic weapons and armor
5. **High-Stat Armor** - Armor with 65+ total stats
6. **DIM Favorites** - Items tagged as favorite in DIM
7. **DIM Keep Tags** - Items tagged as keep in DIM

You can customize these rules when generating cleanup plans.

## Armor Scoring

Armor is scored 0-100 based on:

- **Total stats** (base score)
- **Stat spikes** (20+ in a single stat)
- **Distribution** (well-rounded vs specialized)
- **Profile fit** (how well it fits PvP, PvE, ability builds, etc.)

### Stat Profiles

Built-in profiles for different build types:

- **PvP Hunter**: Prioritizes Mobility, Recovery
- **PvP Titan**: Prioritizes Resilience, Recovery
- **PvP Warlock**: Prioritizes Recovery, Resilience
- **PvE Ability**: Prioritizes Discipline, Strength
- **PvE Balanced**: General purpose
- **GM Nightfall**: Survival-focused

## Development

```bash
# Run in development mode
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run build
```

## Architecture

```
src/
├── bungie/           # Bungie API client and manifest
│   ├── client.ts     # API requests and auth
│   └── manifest.ts   # Item definitions
├── dim/              # DIM integration
│   └── parser.ts     # Backup file parser
├── analysis/         # Item analysis
│   ├── armor-scorer.ts      # Armor scoring engine
│   └── duplicate-finder.ts  # Duplicate detection
├── planner/          # Cleanup planning
│   └── cleanup-planner.ts   # Plan generation
├── mcp/              # MCP server
│   ├── server.ts     # Server implementation
│   └── tools.ts      # Tool definitions
├── types.ts          # Type definitions
└── index.ts          # Entry point
```

## Security Notes

- Your Bungie API key is sent only to Bungie's servers
- OAuth tokens are stored locally and never logged
- DIM backups are processed locally only
- No data is sent to third parties

## License

MIT

## Acknowledgments

- [Bungie API](https://github.com/Bungie-net/api) for the Destiny 2 API
- [DIM](https://destinyitemmanager.com) for the loadout/backup format
- [MCP](https://modelcontextprotocol.io) for the server protocol
