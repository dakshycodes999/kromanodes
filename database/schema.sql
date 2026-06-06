-- Database schema for KromaNodes Minecraft Hosting (Custom Auth Version)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Drop old tables if they exist
drop table if exists public.referred_users cascade;
drop table if exists public.invites cascade;
drop table if exists public.servers cascade;
drop table if exists public.users cascade;
drop table if exists public.rewards_config cascade;

-- 1. Users Table (custom credentials)
create table public.users (
    id uuid default uuid_generate_v4() primary key,
    username text not null,
    email text unique not null,
    password_hash text not null,
    coins integer default 0 check (coins >= 0),
    invite_count integer default 0 check (invite_count >= 0),
    ram_limit_mb integer default 2048, -- Starts at 2GB
    max_server_slots integer default 1, -- Starts with 1 server slot
    claimedMilestones integer[] default '{}',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Invites Tracker Table
create table public.invites (
    code text primary key,
    inviter_id uuid references public.users(id) on delete cascade,
    uses integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Referred Users mapping
create table public.referred_users (
    referred_id uuid primary key references public.users(id) on delete cascade,
    inviter_id uuid references public.users(id) on delete cascade,
    invite_code text references public.invites(code) on delete set null,
    joined_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Servers Table (Linked to Pterodactyl API)
create table public.servers (
    id uuid default uuid_generate_v4() primary key,
    pterodactyl_id integer unique, -- Server ID on Pterodactyl panel
    owner_id uuid references public.users(id) on delete cascade not null,
    name text not null,
    egg_type text not null default 'paper',
    ram_mb integer default 2048 check (ram_mb >= 512),
    cpu_percent integer default 100 check (cpu_percent >= 50),
    disk_mb integer default 5120 check (disk_mb >= 1024),
    status text default 'creating' check (status in ('creating', 'running', 'offline', 'suspended', 'installing')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Invite Rewards Configurations (milestones)
create table public.rewards_config (
    id serial primary key,
    required_invites integer not null unique,
    reward_type text not null check (reward_type in ('ram', 'server_slot', 'coins')),
    reward_value integer not null,
    reward_description text not null
);

-- Seed rewards config
insert into public.rewards_config (required_invites, reward_type, reward_value, reward_description) values
(3, 'ram', 512, 'Claim 3 invites to get +512MB RAM permanently!'),
(5, 'server_slot', 1, 'Claim 5 invites to get +1 extra server slot!'),
(10, 'ram', 1024, 'Claim 10 invites to get +1024MB (1GB) extra RAM permanently!'),
(15, 'ram', 2048, 'Claim 15 invites to get +2048MB (2GB) extra RAM permanently!');
