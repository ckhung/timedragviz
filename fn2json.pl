#!/usr/bin/perl -w

# usage: head -n 1 data.csv | ./fn2json.pl > fn-tree.json

use strict;
use JSON;

my (@field_names) = split(/[,\n]/, <>);
my ($result, @seg, $f, $s, $parent);
$result = {};
foreach $f (@field_names) {
    $parent = $result;
    foreach $s (split(/:/, $f)) {
	$parent->{$s} = {} unless exists($parent->{$s});
	$parent = $parent->{$s};
    }
}

my ($json) = JSON->new->allow_nonref;
print $json->pretty->encode($result);

