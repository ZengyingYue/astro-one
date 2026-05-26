"""Chat channels module with plugin architecture."""

from astro_one.channels.base import BaseChannel
from astro_one.channels.manager import ChannelManager

__all__ = ["BaseChannel", "ChannelManager"]
