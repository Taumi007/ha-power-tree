"""Stromnetz: Sicherungskästen, Abgänge, Zähler und Bilanz als Integration mit eigenem Panel."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from aiohttp import web
from homeassistant.components.http import KEY_HASS, HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import floor_registry as fr
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .const import (DOMAIN, PANEL_ELEMENT, PANEL_URL, STATIC_URL, STORAGE_KEY,
                    STORAGE_VERSION)
from .model import Netz, empty, normalize
from .websocket import async_register_commands

_LOGGER = logging.getLogger(__name__)
PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
FRONTEND_DIR = Path(__file__).parent / "frontend"


class FrontendView(HomeAssistantView):
    """Panel-Dateien mit »no-cache«: der Browser fragt jedes Mal nach (ETag/Last-Modified) und holt
    nach einem Deploy sofort die neue Fassung, auch ohne HA-Neustart (die Version im Pfad ändert
    sich nur beim Start)."""

    url = STATIC_URL + "/{version}/{filename:.+}"
    name = "stromnetz:frontend"
    requires_auth = False

    async def get(self, request: web.Request, version: str, filename: str) -> web.StreamResponse:
        root = FRONTEND_DIR.resolve()
        path = (root / filename).resolve()
        if root not in path.parents or path.suffix not in (".js", ".css", ".json"):
            raise web.HTTPNotFound()
        if not await request.app[KEY_HASS].async_add_executor_job(path.is_file):
            raise web.HTTPNotFound()
        return web.FileResponse(path, headers={"Cache-Control": "no-cache"})


@dataclass
class Runtime:
    store: Store
    data: dict

    def netz(self, hass: HomeAssistant, data: dict | None = None) -> Netz:
        areas, floors = registries(hass)
        return Netz(data if data is not None else self.data, areas, floors)


type StromnetzConfigEntry = ConfigEntry[Runtime]


def registries(hass: HomeAssistant) -> tuple[dict, dict]:
    areas = {a.id: {"name": a.name, "floor": a.floor_id} for a in ar.async_get(hass).async_list_areas()}
    floors = {f.floor_id: f.name for f in fr.async_get(hass).async_list_floors()}
    return areas, floors




async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    async_register_commands(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: StromnetzConfigEntry) -> bool:
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load()
    if data is None:
        data = empty()
        await store.async_save(data)
    entry.runtime_data = Runtime(store, normalize(data))

    await _register_panel(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: StromnetzConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: StromnetzConfigEntry) -> None:
    frontend.async_remove_panel(hass, PANEL_URL)
    await Store(hass, STORAGE_VERSION, STORAGE_KEY).async_remove()


async def _register_panel(hass: HomeAssistant) -> None:
    flags = hass.data.setdefault(DOMAIN, {})
    if not flags.get("static"):
        # Version im Pfad, damit auch die relativ importierten Module neu geladen werden
        def newest() -> str:
            digest = hashlib.sha1()
            for p in sorted(FRONTEND_DIR.glob("*.js")):
                digest.update(p.read_bytes())
            return digest.hexdigest()[:10]

        flags["version"] = await hass.async_add_executor_job(newest)
        flags["base"] = f"{STATIC_URL}/{flags['version']}"
        hass.http.register_view(FrontendView)
        flags["static"] = True
    if PANEL_URL in hass.data.get(frontend.DATA_PANELS, {}):
        return
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_ELEMENT,
        frontend_url_path=PANEL_URL,
        module_url=f"{flags['base']}/stromnetz-panel.js",
        sidebar_title="Stromnetz",
        sidebar_icon="mdi:transmission-tower",
        require_admin=True,
        config={},
    )
