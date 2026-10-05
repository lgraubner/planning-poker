package httpserver

import (
	"net/netip"
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	last   time.Time
}

func (b *bucket) refill(rate, burst float64) {
	now := time.Now()

	if b.last.IsZero() {
		b.tokens = burst
	} else {
		b.tokens = min(burst, b.tokens+now.Sub(b.last).Seconds()*rate)
	}

	b.last = now
}

func (b *bucket) allow(rate, burst float64) bool {
	b.refill(rate, burst)
	if b.tokens < 1 {
		return false
	}

	b.tokens--
	return true
}

type limiter struct {
	mu          sync.Mutex
	buckets     map[netip.Addr]*bucket
	rate, burst float64
}

func newLimiter(rate, burst float64) *limiter {
	return &limiter{buckets: make(map[netip.Addr]*bucket), rate: rate, burst: burst}
}

func (l *limiter) allow(ip netip.Addr) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	return l.bucket(ip).allow(l.rate, l.burst)
}

// ready reports whether the client has a token left, without spending it.
func (l *limiter) ready(ip netip.Addr) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	b := l.bucket(ip)
	b.refill(l.rate, l.burst)

	return b.tokens >= 1
}

// bucket returns the client's bucket. The caller holds l.mu.
func (l *limiter) bucket(ip netip.Addr) *bucket {
	if len(l.buckets) >= 10000 {
		// ponytail: O(n) prune, and a reset when a wide flood keeps it full; use an LRU if that shows up.
		for key, b := range l.buckets {
			if time.Since(b.last) > time.Minute {
				delete(l.buckets, key)
			}
		}

		if len(l.buckets) >= 10000 {
			clear(l.buckets)
		}
	}

	b := l.buckets[ip]
	if b == nil {
		b = &bucket{}
		l.buckets[ip] = b
	}

	return b
}
