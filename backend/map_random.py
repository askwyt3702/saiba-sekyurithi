"""Portable SHA256 counter RNG; no Python random/hash or host byte order."""
import hashlib
import re


def normalize_seed(seed: str) -> str:
    if not isinstance(seed, str) or not re.fullmatch(r"[0-9a-fA-F]{32}", seed):
        raise ValueError("seed must be exactly 32 hexadecimal characters")
    return seed.lower()


class CounterRandom:
    def __init__(self, seed: str, stream: str):
        self.seed = normalize_seed(seed)
        self.stream = stream
        self.counter = 0

    def uint32(self) -> int:
        message = f"nullroute|{self.seed}|{self.stream}|{self.counter}".encode("utf-8")
        self.counter += 1
        return int.from_bytes(hashlib.sha256(message).digest()[:4], "big")

    def below(self, size: int) -> int:
        if not isinstance(size, int) or isinstance(size, bool) or not 0 < size <= 2**32:
            raise ValueError("invalid random range")
        limit = 2**32 - (2**32 % size)
        while True:
            value = self.uint32()
            if value < limit:
                return value % size

    def shuffle(self, values):
        result = list(values)
        for i in range(len(result) - 1, 0, -1):
            j = self.below(i + 1)
            result[i], result[j] = result[j], result[i]
        return result
